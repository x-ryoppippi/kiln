import type { VitePlugin } from "unplugin";

import type { TransformOptions, TransformResult } from "../transform.ts";
import { createBuild, emitSheets, graphOf, record, splitMode, type Build } from "./build.ts";
import type { Mode } from "./plan.ts";

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

interface EnvironmentBuild extends Build {
  mode: Mode;
  // The emitted sheet's file name by preliminary chunk file name, once the output's chunks are planned.
  sheets: Map<string, string> | null;
}

// Plans kiln's stylesheets from the chunk graph of a Vite client build with `extract`, and hands them to Vite's own
// HTML links, preloads and manifest through each chunk's `viteMetadata.importedCss`. Kiln's rules skip Vite's CSS
// pipeline, so PostCSS, `build.cssTarget` and Lightning CSS targets do not apply to them. Dev keeps a CSS module per
// source module.
export function viteSplit(
  options: TransformOptions,
  compiles: (id: string) => boolean,
): {
  record(environment: Environment | undefined, id: string, result: TransformResult | null): void;
  planned(environment: Environment | undefined): boolean;
  hooks: Partial<VitePlugin>;
} {
  const builds = new Map<string, EnvironmentBuild | null>();

  function start(environment: Environment): EnvironmentBuild | null {
    const { config } = environment;
    // A library's stylesheet is named by `build.lib.cssFileName`, which only Vite's CSS pipeline writes.
    if (!options.extract || config.command !== "build" || config.consumer !== "client" || config.build.lib) {
      return null;
    }
    let mode: Mode = config.build.cssCodeSplit === false ? "single" : splitMode(options);
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
    return { ...createBuild(), mode, sheets: null };
  }

  const buildOf = (environment: Environment | undefined): EnvironmentBuild | null => {
    if (!environment) return null;
    if (!builds.has(environment.name)) builds.set(environment.name, start(environment));
    return builds.get(environment.name)!;
  };

  return {
    record(environment, id, result) {
      const build = buildOf(environment);
      if (build) record(build, id, result?.rules ?? []);
    },
    planned: (environment) => buildOf(environment) !== null,
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
          build.sheets ??= emitSheets(
            build,
            graphOf(chunks, this.environment.config.root),
            build.mode,
            options,
            compiles,
            (source) => this.getFileName(this.emitFile({ type: "asset", name: "kiln.css", source })),
          );
          const sheet = build.sheets.get(chunk.fileName);
          if (sheet) chunk.viteMetadata!.importedCss.add(sheet);
          return null;
        },
      },
      // The JS of a chunk names its sheet in `__vite__mapDeps`, so a changed sheet must change the chunk's hash.
      augmentChunkHash(chunk) {
        return buildOf(this.environment)?.sheets?.get(chunk.fileName);
      },
    },
  };
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;
  const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const { default: path } = await import("node:path");
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
      exports: [],
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
