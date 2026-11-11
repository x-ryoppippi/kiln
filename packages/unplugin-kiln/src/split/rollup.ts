import path from "node:path";
import MagicString from "magic-string";

import type { TransformOptions } from "../transform.ts";
import { createBuild, emitSheets, graphOf, record, splitMode, type RenderedChunk, type Rules } from "./build.ts";
import type { Graph, Mode } from "./plan.ts";

/** Where a Rollup or Rolldown build with `extract` lists each chunk's kiln stylesheet, relative to the output. */
export const MANIFEST = ".kiln/manifest.json";

/** One output chunk in {@link MANIFEST}, keyed by its file name like the chunks it imports. */
export interface ManifestChunk {
  file: string;
  /**
   * The stylesheets that load with the chunk, those of the chunks it imports statically first. A page links an entry's
   * to have them before its script runs.
   */
  css?: string[];
  imports?: string[];
  dynamicImports?: string[];
  isEntry?: boolean;
  isDynamicEntry?: boolean;
}

// The parts of the plugin context, output options and output bundle that Rollup and Rolldown share and the adapter uses.
interface Context {
  emitFile(file: { type: "asset"; name?: string; fileName?: string; source: string }): string;
  getFileName(referenceId: string): string;
  warn(message: string): void;
}

interface OutputOptions {
  format: string;
  sourcemap?: unknown;
}

interface OutputChunk {
  type: "chunk";
  fileName: string;
  preliminaryFileName: string;
  imports: readonly string[];
  dynamicImports: readonly string[];
  isEntry: boolean;
  isDynamicEntry: boolean;
}

interface Output {
  esm: boolean;
  plan: { graph: Graph; sheets: Map<string, string>; loads: Map<string, string[]> } | null;
}

// Each chunk with a sheet loads it before its own code runs, through a top-level await, so whatever loads the chunk
// (an import of any kind, from any page) also gets its rules. A dynamic import of a chunk first starts loading the
// sheets that arrive with it, in parallel with the chunk's JS; the chunk then finds the link already there. A sheet the
// page links itself, as an entry's should be, is never loaded twice. Outside a browser it does nothing.
// The loader is a global defined by one module, which every module with rules imports, so it ships once and has run
// before any chunk with a sheet, whose rules come from such modules in its static closure. A chunk that imports another
// dynamically need not contain one, so it calls the loader only if some chunk already defined it; the target loads its
// sheets itself either way. Each call passes its own chunk's URL, which the sheet's path is relative to.
export const LOADER_ID = "virtual:kiln-css-loader";
const RESOLVED_LOADER = "\0" + LOADER_ID;
const LOADER = "__kiln$css";
const LOADER_SOURCE = `globalThis.${LOADER} ??= (file, base) => {
  if (typeof document === "undefined") return;
  const href = new URL(file, base).href;
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) if (link.href === href) return link.__kiln;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.append(link);
  return (link.__kiln = new Promise((settle) => (link.onload = link.onerror = settle)));
};
`;
const DYNAMIC_IMPORT = /\bimport\(\s*(["'`])([^"'`]+)\1\s*\)/g;
const exactly = (id: string) => new RegExp(`^${id.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&")}$`);

interface Hooks {
  // Builds that plan sheets never import a `.kiln.css` module, so these replace the hooks that resolve one.
  resolveId: {
    filter: { id: RegExp };
    handler(id: string): { id: string; moduleSideEffects: true } | null;
  };
  load: { filter: { id: RegExp }; handler(id: string): string | null };
  renderStart(this: Context, outputOptions: OutputOptions): void;
  renderChunk: {
    order: "post";
    handler(
      this: Context,
      code: string,
      chunk: RenderedChunk,
      outputOptions: OutputOptions,
      meta: { chunks: Record<string, RenderedChunk> },
    ): { code: string; map: ReturnType<MagicString["generateMap"]> | null } | null;
  };
  generateBundle(
    this: Context,
    outputOptions: OutputOptions,
    bundle: Record<string, OutputChunk | { type: "asset" }>,
  ): void;
}

// Plans kiln's stylesheets from the chunk graph of each Rollup or Rolldown output with `extract`, emits them as assets
// and makes every chunk load its own, as `LOADER_ID` describes. Only ES module output can wait for a sheet, so other
// formats get one sheet per entry that the page has to link; the manifest lists every sheet for that.
export function rollupSplit(
  options: TransformOptions,
  compiles: (id: string) => boolean,
): { record(id: string, rules: Rules): void; hooks: Hooks } {
  const build = createBuild();
  let output: Output = { esm: true, plan: null };

  const planOf = (context: Context, chunks: Record<string, RenderedChunk>) => {
    if (output.plan) return output.plan;
    const mode: Mode = output.esm ? splitMode(options) : "single";
    const graph = graphOf(chunks, process.cwd());
    const sheets = emitSheets(build, graph, mode, options, compiles, (source) =>
      context.getFileName(context.emitFile({ type: "asset", name: "kiln.css", source })),
    );
    return (output.plan = { graph, sheets, loads: new Map() });
  };

  // The sheets that arrive with a chunk: those of the chunks in its static closure, imports first, as they run.
  const loadsOf = ({ graph, sheets, loads }: NonNullable<Output["plan"]>, key: string) => {
    let files = loads.get(key);
    if (files) return files;
    files = [];
    const seen = new Set<string>();
    const visit = (current: string) => {
      if (seen.has(current) || !graph.has(current)) return;
      seen.add(current);
      for (const next of graph.get(current)!.imports) visit(next);
      const sheet = sheets.get(current);
      if (sheet) files!.push(sheet);
    };
    visit(key);
    loads.set(key, files);
    return files;
  };

  return {
    record(id, rules) {
      record(build, id, rules);
    },
    hooks: {
      // Older Rollup versions ignore a hook's filter, so the handlers check the id too.
      resolveId: {
        filter: { id: exactly(LOADER_ID) },
        // The loader runs for its side effect, which `treeshake.moduleSideEffects: false` would otherwise drop.
        handler: (id) => (id === LOADER_ID ? { id: RESOLVED_LOADER, moduleSideEffects: true } : null),
      },
      load: {
        filter: { id: exactly(RESOLVED_LOADER) },
        handler: (id) => (id === RESOLVED_LOADER ? LOADER_SOURCE : null),
      },
      renderStart(outputOptions) {
        const esm = ["es", "esm", "module"].includes(outputOptions.format);
        output = { esm, plan: null };
        if (!esm && splitMode(options) === "chunks") {
          this.warn(
            `[kiln] extract splits stylesheets by chunk only for ES module output, which can wait for them to load; ` +
              `this ${outputOptions.format} output gets one stylesheet per entry, which the page must link from ${MANIFEST}.`,
          );
        }
      },
      renderChunk: {
        order: "post",
        handler(code, chunk, outputOptions, { chunks }) {
          const plan = planOf(this, chunks);
          if (!output.esm) return null;

          const dir = path.posix.dirname(chunk.fileName);
          const args = (file: string) => `(${JSON.stringify(path.posix.relative(dir, file))},import.meta.url)`;
          const s = new MagicString(code);
          // A running chunk has loaded the sheets of its own static closure already.
          const loaded = new Set(loadsOf(plan, chunk.fileName));
          const loadsWith = (target: string) => loadsOf(plan, target).filter((file) => !loaded.has(file));
          let loads = false;
          if (chunk.dynamicImports.some((target) => loadsWith(target).length > 0)) {
            for (const match of code.matchAll(DYNAMIC_IMPORT)) {
              const files = loadsWith(path.posix.join(dir, match[2]!));
              if (files.length === 0) continue;
              s.appendLeft(match.index, "(" + files.map((file) => `globalThis.${LOADER}?.${args(file)},`).join(""));
              s.appendRight(match.index + match[0].length, ")");
              loads = true;
            }
          }
          const own = plan.sheets.get(chunk.fileName);
          if (!own && !loads) return null;
          if (own) {
            s.prepend(`await ${LOADER}${args(own)};\n`);
            // Within one chunk, modules run in order after the top-level await, so the chunk that holds the loader
            // defines it first. Its code moves up when found as rendered; otherwise it runs twice, which `??=` allows.
            if (RESOLVED_LOADER in chunk.modules) {
              const rendered = chunk.modules[RESOLVED_LOADER]!.code;
              const at = rendered ? code.indexOf(rendered) : -1;
              if (at >= 0) s.remove(at, at + rendered!.length);
              s.prepend(at >= 0 ? rendered! + "\n" : LOADER_SOURCE);
            }
          }
          return {
            code: s.toString(),
            map: outputOptions.sourcemap ? s.generateMap({ hires: "boundary", includeContent: true }) : null,
          };
        },
      },
      generateBundle(_outputOptions, bundle) {
        const chunks = Object.values(bundle).filter((file): file is OutputChunk => file.type === "chunk");
        const inBundle = (file: string) => bundle[file]?.type === "chunk";
        const manifest: Record<string, ManifestChunk> = {};
        for (const chunk of chunks) {
          const css = output.plan ? loadsOf(output.plan, chunk.preliminaryFileName) : [];
          const imports = chunk.imports.filter(inBundle);
          const dynamicImports = chunk.dynamicImports.filter(inBundle);
          manifest[chunk.fileName] = {
            file: chunk.fileName,
            ...(css.length > 0 && { css }),
            ...(imports.length > 0 && { imports }),
            ...(dynamicImports.length > 0 && { dynamicImports }),
            ...(chunk.isEntry && { isEntry: true }),
            ...(chunk.isDynamicEntry && { isDynamicEntry: true }),
          };
        }
        this.emitFile({ type: "asset", fileName: MANIFEST, source: JSON.stringify(manifest, null, 2) + "\n" });
      },
    },
  };
}

if (import.meta.vitest) {
  const { afterEach, describe, expect, it, vi } = import.meta.vitest;
  const { runInThisContext } = await import("node:vm");
  const { compileEntry } = await import("kiln/core");

  class Link {
    rel = "";
    href = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
  }

  // Runs the loader module in a page whose head holds `links`, and loads sheets as a chunk at `CHUNK` would.
  const CHUNK = "https://example.com/app/main.js";
  function loader(links: Link[] = []) {
    vi.stubGlobal(LOADER, undefined);
    vi.stubGlobal("document", {
      head: { append: (link: Link) => void links.push(link) },
      createElement: () => new Link(),
      querySelectorAll: () => links.filter((link) => link.rel === "stylesheet"),
    });
    runInThisContext(LOADER_SOURCE);
    const css = Reflect.get(globalThis, LOADER) as (file: string, base: string) => unknown;
    return { load: (file: string) => css(file, CHUNK), links, url: (file: string) => new URL(file, CHUNK).href };
  }

  const settled = async (promise: unknown) => {
    let done = false;
    void (promise as Promise<unknown>).then(() => (done = true));
    await new Promise((resolve) => setTimeout(resolve));
    return done;
  };

  describe("the stylesheet loader", () => {
    afterEach(() => void vi.unstubAllGlobals());

    it("links a sheet once, relative to its chunk, and waits until it loads", async () => {
      const { load, links, url } = loader();
      const loading = load("assets/kiln.css");
      expect(load("./assets/kiln.css")).toBe(loading);
      expect(Reflect.get(globalThis, LOADER)("../app/assets/kiln.css", CHUNK)).toBe(loading);
      expect(links).toEqual([expect.objectContaining({ rel: "stylesheet", href: url("assets/kiln.css") })]);
      expect(await settled(loading)).toBe(false);
      links[0]!.onload!();
      expect(await settled(loading)).toBe(true);
    });

    it("goes on when a sheet fails to load, as a page does with a broken link", async () => {
      const { load, links } = loader();
      const loading = load("kiln.css");
      links[0]!.onerror!();
      expect(await settled(loading)).toBe(true);
    });

    it("leaves a sheet the page links itself alone", () => {
      const linked = Object.assign(new Link(), { rel: "stylesheet" });
      const { load, links, url } = loader([linked]);
      linked.href = url("kiln.css");
      expect(load("kiln.css")).toBeUndefined();
      expect(links).toEqual([linked]);
    });

    it("does nothing outside a browser", () => {
      const { load } = loader();
      vi.stubGlobal("document", undefined);
      expect(load("kiln.css")).toBeUndefined();
    });
  });

  describe("rollupSplit", () => {
    const chunk = (fileName: string, fields: Partial<RenderedChunk>): RenderedChunk => ({
      fileName,
      moduleIds: ["/" + fileName],
      modules: { ["/" + fileName]: { renderedLength: 1 } },
      imports: [],
      dynamicImports: [],
      isEntry: false,
      isDynamicEntry: false,
      facadeModuleId: "/" + fileName,
      ...fields,
    });
    const chunks = {
      "main.js": chunk("main.js", { isEntry: true, dynamicImports: ["page.js", "widget.js"] }),
      "page.js": chunk("page.js", { isDynamicEntry: true, imports: ["widget.js"] }),
      "widget.js": chunk("widget.js", { isDynamicEntry: true }),
    };

    it("loads the sheets of a chunk's static imports before its own, at its dynamic imports and in the manifest", () => {
      const split = rollupSplit({ extract: true }, () => false);
      split.record("/main.js", compileEntry("color", "red")[2]);
      split.record("/page.js", compileEntry("color", "blue")[2]);
      split.record("/widget.js", compileEntry("color", "green")[2]);
      const emitted = new Map<string, string>();
      const context: Context = {
        emitFile: ({ fileName, source }) => {
          const name = fileName ?? `assets/kiln-${emitted.size}.css`;
          emitted.set(name, source);
          return name;
        },
        getFileName: (name) => name,
        warn: (message) => expect.unreachable(message),
      };
      const outputOptions = { format: "es" };
      split.hooks.renderStart.call(context, outputOptions);
      const render = (fileName: keyof typeof chunks, code: string) =>
        split.hooks.renderChunk.handler.call(context, code, chunks[fileName], outputOptions, { chunks })?.code;

      const main = render("main.js", `export const go = () => [import("./page.js"), import('./widget.js')];\n`);
      const sheetWith = (color: string) => [...emitted].find(([, css]) => css.includes(`color:${color}`))![0];
      const [red, blue, green] = [sheetWith("red"), sheetWith("blue"), sheetWith("green")];
      const load = (file: string) => `globalThis.__kiln$css?.("${file}",import.meta.url)`;
      expect(main).toContain(`await __kiln$css("${red}",import.meta.url);`);
      expect(main).toContain(`(${load(green)},${load(blue)},import("./page.js"))`);
      expect(main).toContain(`(${load(green)},import('./widget.js'))`);
      expect(render("page.js", "export {};\n")).toContain(`await __kiln$css("${blue}",import.meta.url);`);

      const bundle = Object.fromEntries(
        Object.values(chunks).map((info) => [
          info.fileName,
          { type: "chunk" as const, preliminaryFileName: info.fileName, ...info },
        ]),
      );
      split.hooks.generateBundle.call(context, outputOptions, bundle);
      const manifest: Record<string, ManifestChunk> = JSON.parse(emitted.get(MANIFEST)!);
      expect(manifest["main.js"]!.css).toEqual([red]);
      expect(manifest["page.js"]).toEqual({
        file: "page.js",
        css: [green, blue],
        imports: ["widget.js"],
        isDynamicEntry: true,
      });
    });

    it("resolves its loader to a module whose side effect tree-shaking keeps", () => {
      const { hooks } = rollupSplit({ extract: true }, () => false);
      expect(hooks.resolveId.filter.id.test(LOADER_ID)).toBe(true);
      expect(hooks.resolveId.filter.id.test("x" + LOADER_ID)).toBe(false);
      const resolved = hooks.resolveId.handler(LOADER_ID)!;
      expect(resolved).toEqual({ id: "\0" + LOADER_ID, moduleSideEffects: true });
      expect(hooks.resolveId.handler("./page.js")).toBeNull();
      expect(hooks.load.filter.id.test(resolved.id)).toBe(true);
      expect(hooks.load.handler(resolved.id)).toBe(LOADER_SOURCE);
      expect(hooks.load.handler(LOADER_ID)).toBeNull();
    });
  });
}
