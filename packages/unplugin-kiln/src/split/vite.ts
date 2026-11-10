import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { VitePlugin } from "unplugin";

import { compileModule, type TransformOptions, type TransformResult } from "../transform.ts";
import { plan, type Graph, type Mode } from "./plan.ts";
import { renderSheet } from "./sheet.ts";

// The parts of a Vite environment the planner reads.
interface Environment {
  name: string;
  config: {
    command: "build" | "serve";
    consumer: "client" | "server";
    root: string;
    build: { cssCodeSplit: boolean; lib: unknown; modulePreload: unknown };
    experimental: { renderBuiltUrl?: unknown };
  };
  logger: { warn(message: string): void };
}

interface Build {
  mode: Mode;
  // Rule classes by full module id, query included, for every module kiln transformed.
  moduleRules: Map<string, readonly string[]>;
  ruleText: Map<string, string>;
  // The emitted sheet's file name by preliminary chunk file name, once the output's chunks are planned.
  sheets: Map<string, string> | null;
}

type RenderedChunks = Parameters<Extract<NonNullable<VitePlugin["renderChunk"]>, Function>>[3]["chunks"];

// Plans kiln's stylesheets from the chunk graph of a Vite client build with `extract`, and hands them to Vite's own
// HTML links, preloads and manifest through each chunk's `viteMetadata.importedCss`. Kiln's rules skip Vite's CSS
// pipeline, so PostCSS, `build.cssTarget` and Lightning CSS targets do not apply to them. Dev keeps a CSS module per
// source module.
export function viteSplit(options: TransformOptions, compiles: (id: string) => boolean) {
  const builds = new Map<string, Build | null>();

  function start(environment: Environment): Build | null {
    const { config } = environment;
    // A library's stylesheet is named by `build.lib.cssFileName`, which only Vite's CSS pipeline writes.
    if (!options.extract || config.command !== "build" || config.consumer !== "client" || config.build.lib) {
      return null;
    }
    let mode: Mode =
      (typeof options.extract === "object" && options.extract.split === "single") || config.build.cssCodeSplit === false
        ? "single"
        : "chunks";
    const untested = [
      config.build.modulePreload === false && "build.modulePreload: false",
      config.experimental.renderBuiltUrl && "experimental.renderBuiltUrl",
    ].filter(Boolean);
    if (mode === "chunks" && untested.length > 0) {
      environment.logger.warn(
        `[kiln] extract splits stylesheets by chunk only without ${untested.join(" or ")}; ` +
          `this build gets one stylesheet per entry.`,
      );
      mode = "single";
    }
    return { mode, moduleRules: new Map(), ruleText: new Map(), sheets: null };
  }

  const buildOf = (environment: Environment | undefined): Build | null => {
    if (!environment) return null;
    if (!builds.has(environment.name)) builds.set(environment.name, start(environment));
    return builds.get(environment.name)!;
  };

  const record = (build: Build, id: string, rules: TransformResult["rules"]) => {
    for (const [rule, text] of rules) build.ruleText.set(rule, text);
    const classes = rules.map(([rule]) => rule);
    build.moduleRules.set(id, classes);
    return classes;
  };

  // A module the transform never saw in this process, such as one restored from a cache, is compiled again from the
  // file on disk. For a query variant that is the whole file, a superset of its rules, as the `load` fallback explains.
  const rulesOf = (build: Build, id: string) => {
    const known = build.moduleRules.get(id);
    if (known) return known;
    const filename = id.replace(/[?#].*$/, "");
    const result =
      compiles(id) && existsSync(filename) ? compileModule(readFileSync(filename, "utf8"), id, options, false) : null;
    return record(build, id, result?.rules ?? []);
  };

  function graphOf(chunks: RenderedChunks, root: string): Graph {
    const name = (id: string) => path.relative(root, id);
    return new Map(
      Object.entries(chunks).map(([key, chunk]) => [
        key,
        {
          modules: chunk.moduleIds.filter((id) => chunk.modules[id]?.renderedLength !== 0),
          imports: chunk.imports,
          dynamicImports: chunk.dynamicImports,
          isEntry: chunk.isEntry,
          isDynamicEntry: chunk.isDynamicEntry,
          stableName: chunk.facadeModuleId ? name(chunk.facadeModuleId) : chunk.moduleIds.map(name).sort().join("\n"),
        },
      ]),
    );
  }

  return {
    record(environment: Environment | undefined, id: string, result: TransformResult | null): void {
      const build = buildOf(environment);
      if (build) record(build, id, result?.rules ?? []);
    },
    planned: (environment: Environment | undefined): boolean => buildOf(environment) !== null,
    hooks: {
      configResolved() {
        builds.clear();
      },
      renderStart() {
        const build = buildOf(this.environment);
        if (build) build.sheets = null;
      },
      renderChunk: {
        order: "post",
        handler(_code, chunk, _options, { chunks }) {
          const build = buildOf(this.environment);
          if (!build) return null;
          if (!build.sheets) {
            const planned = plan(graphOf(chunks, this.environment.config.root), (id) => rulesOf(build, id), build.mode);
            build.sheets = new Map();
            for (const [key, classes] of planned) {
              const source = renderSheet(classes, (rule) => build.ruleText.get(rule)!);
              build.sheets.set(key, this.getFileName(this.emitFile({ type: "asset", name: "kiln.css", source })));
            }
          }
          const sheet = build.sheets.get(chunk.fileName);
          if (sheet) chunk.viteMetadata!.importedCss.add(sheet);
          return null;
        },
      },
      // The JS of a chunk names its sheet in `__vite__mapDeps`, so a changed sheet must change the chunk's hash.
      augmentChunkHash(chunk) {
        return buildOf(this.environment)?.sheets?.get(chunk.fileName);
      },
    } satisfies Partial<VitePlugin>,
  };
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;
  const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { compileEntry } = await import("kiln/core");

  const environment = (overrides: { build?: object; experimental?: object } = {}) => {
    const warnings: string[] = [];
    return {
      warnings,
      name: "client",
      config: {
        command: "build" as const,
        consumer: "client" as const,
        root: "/",
        build: { cssCodeSplit: true, lib: false, modulePreload: { polyfill: true }, ...overrides.build },
        experimental: { ...overrides.experimental },
      },
      logger: { warn: (message: string) => void warnings.push(message) },
    };
  };

  // Runs the plugin's renderChunk over one entry chunk holding `modules` and returns the sheet emitted for it.
  async function render(env: ReturnType<typeof environment>, modules: string[]) {
    const { unplugin } = await import("../index.ts");
    const renderChunk = unplugin.raw({ extract: true }, { framework: "vite", versions: {} }).vite?.renderChunk;
    if (typeof renderChunk !== "object") throw new Error("expected an object hook");
    const emitted: string[] = [];
    const context = {
      environment: env,
      emitFile: ({ source }: { source: string }) => String(emitted.push(source) - 1),
      getFileName: (ref: string) => `assets/kiln-${ref}.css`,
    };
    const chunk = {
      fileName: "assets/index.js",
      moduleIds: modules,
      modules: Object.fromEntries(modules.map((id) => [id, { renderedLength: 1 }])),
      imports: [],
      dynamicImports: [],
      isEntry: true,
      isDynamicEntry: false,
      facadeModuleId: modules[0],
      viteMetadata: { importedCss: new Set<string>(), importedAssets: new Set<string>() },
    };
    Reflect.apply(renderChunk.handler, context, ["", chunk, {}, { chunks: { [chunk.fileName]: chunk } }]);
    return { css: emitted.join("\n"), importedCss: [...chunk.viteMetadata.importedCss] };
  }

  describe("viteSplit", () => {
    it("compiles a module from disk when the transform never saw it, as after a cache restore", async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "kiln-split-"));
      const page = path.join(dir, "page.tsx");
      await writeFile(page, `export const Page = () => <main css={{ color: "red" }} />;\n`);
      try {
        const { css, importedCss } = await render(environment(), [page + "?split=component"]);
        expect(css).toContain(compileEntry("color", "red")[2][0]![1].slice("@layer k2{".length, -1));
        expect(importedCss).toEqual(["assets/kiln-0.css"]);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it("plans only client builds, and leaves library builds to Vite's CSS pipeline", () => {
      const split = viteSplit({ extract: true }, () => true);
      expect(split.planned(environment())).toBe(true);
      expect(viteSplit({}, () => true).planned(environment())).toBe(false);
      expect(
        split.planned({ ...environment(), name: "ssr", config: { ...environment().config, consumer: "server" } }),
      ).toBe(false);
      expect(
        split.planned({
          ...environment(),
          name: "lib",
          config: { ...environment().config, build: { ...environment().config.build, lib: {} } },
        }),
      ).toBe(false);
    });

    it("warns and falls back to one sheet per entry where splitting is untested", () => {
      const env = environment({ build: { modulePreload: false } });
      const split = viteSplit({ extract: true }, () => true);
      expect(split.planned(env)).toBe(true);
      expect(env.warnings).toEqual([expect.stringContaining("build.modulePreload: false")]);
    });
  });
}
