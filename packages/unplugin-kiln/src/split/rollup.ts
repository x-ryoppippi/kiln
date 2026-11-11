import path from "node:path";
import { init, parse } from "es-module-lexer";
import MagicString from "magic-string";
import { parseSync } from "oxc-parser";

import type { TransformOptions } from "../transform.ts";
import { createBuild, emitSheets, graphOf, record, splitMode, type RenderedChunk, type Rules } from "./build.ts";
import type { Graph, Mode } from "./plan.ts";

/**
 * Where a Rollup or Rolldown build with `extract` lists each chunk's kiln stylesheets, relative to an ES module output.
 * Outputs of other formats write `.kiln/manifest.<format>.json`, so they can share a directory with it.
 */
export const MANIFEST = ".kiln/manifest.json";

/** The manifest of an output in `format`, relative to the output; {@link MANIFEST} for ES modules. */
export const manifestFile = (format: string): string =>
  isESM(format) ? MANIFEST : MANIFEST.replace(/\.json$/, `.${format}.json`);

/** One output chunk in a manifest, keyed by its file name like the chunks it imports. */
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
  error(message: string): never;
}

interface OutputOptions {
  format: string;
  dir?: string;
  file?: string;
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

interface Plan {
  graph: Graph;
  sheets: Map<string, string>;
  loads: Map<string, string[]>;
  // Where each chunk that loads a sheet gets the loader from, by chunk key, and the name each chunk that others import it
  // from exports it as.
  loaders: Map<string, string>;
  exports: Map<string, string>;
}

interface Output {
  esm: boolean;
  plan: Plan | null;
}

const isESM = (format: string) => ["es", "esm", "module"].includes(format);

// Each chunk with a sheet loads it before its own code runs, through a top-level await, so whatever loads the chunk
// (an import of any kind, from any page) also gets its rules. A dynamic import of a chunk first starts loading the
// sheets that arrive with it, in parallel with the chunk's JS; the chunk then finds the link already there. A sheet the
// page links itself, as an entry's should be, is never loaded twice. Outside a browser it does nothing.
// The loader is a function declaration that kiln adds to chunks as they render, outside every module, and that other
// chunks import. A declared function, imported or not, is bound before any module of the graph runs, so no order in
// which chunks or the modules in them evaluate, cycles and lazily initialised modules included, can reach a call before
// it. Of the chunks that load a sheet in a chunk's static closure, which load with it anyway, the first in stable order
// declares and exports it; a chunk that imports that one directly imports the loader, and any other declares its own.
// Links, not the function, carry the state, so the copies share it. The bundler cannot rename around a binding added
// after it renders, so the loader takes the first of these names that a chunk does not use already, such as one that
// kiln added to a library the chunk bundles, and reaches the browser globals it uses through `globalThis`, which a
// module-level binding such as `const document` cannot shadow.
const LOADER = "__kiln$css";
const nameFree = (taken: (name: string) => boolean) => {
  let i = 0;
  while (taken(i ? LOADER + i : LOADER)) i++;
  return i ? LOADER + i : LOADER;
};
// Written minified: it is added after any renderChunk minifier has run.
const loaderSource = (name: string) =>
  `function ${name}(f,b){const d=globalThis.document;if(!d)return;const h=new globalThis.URL(f,b).href;` +
  `for(const l of d.querySelectorAll('link[rel="stylesheet"]'))if(l.href===h)return l.__kiln;` +
  `const l=d.createElement("link");l.rel="stylesheet";l.href=h;d.head.append(l);` +
  `return l.__kiln=new globalThis.Promise(r=>l.onload=l.onerror=r)}`;
const binding = (exported: string, local: string) => (exported === local ? local : `${exported} as ${local}`);

// The end of a chunk's hashbang and directives, which have to stay first. Only a chunk whose first token is a string can
// have directives, so only such a chunk, which is rare, needs a full parse to find where they end.
const TRIVIA = /^(?:#![^\n\r\u2028\u2029]*)?(?:\s|\/\/[^\n\r\u2028\u2029]*|\/\*[\s\S]*?\*\/)*/;
function prologueOf(code: string, fileName: string): number {
  const hashbang = code.startsWith("#!") ? /^#![^\n\r\u2028\u2029]*/.exec(code)![0].length : 0;
  const first = code[TRIVIA.exec(code)![0].length];
  if (first !== '"' && first !== "'") return hashbang;
  let end = hashbang;
  for (const statement of parseSync(fileName, code, { lang: "jsx", sourceType: "module" }).program.body) {
    if (statement.type !== "ExpressionStatement" || !statement.directive) break;
    end = statement.end;
  }
  return end;
}

// Where each dynamic import in a chunk is, and what it imports if that is a string. A lexer, unlike a pattern, tells an
// import() from text in a string or comment that reads like one; it gives up on JSX, which a build may preserve.
async function dynamicImportsOf(code: string, fileName: string) {
  await init;
  try {
    return parse(code, fileName)[0].flatMap(({ d, n, ss, se }) =>
      d < 0 ? [] : [{ specifier: n, start: ss, end: se }],
    );
  } catch {
    return parseSync(fileName, code, { lang: "jsx", sourceType: "module" }).module.dynamicImports.map(
      ({ start, end, moduleRequest }) => {
        const literal = /^(["'`])([^"'`$\\]*)\1$/.exec(code.slice(moduleRequest.start, moduleRequest.end));
        return { specifier: literal?.[2], start, end };
      },
    );
  }
}

interface Hooks {
  closeBundle(): void;
  renderStart(this: Context, outputOptions: OutputOptions): void;
  renderChunk: {
    order: "post";
    handler(
      this: Context,
      code: string,
      chunk: RenderedChunk,
      outputOptions: OutputOptions,
      meta: { chunks: Record<string, RenderedChunk> },
    ): Promise<{ code: string; map: ReturnType<MagicString["generateMap"]> | null } | null>;
  };
  generateBundle(
    this: Context,
    outputOptions: OutputOptions,
    bundle: Record<string, OutputChunk | { type: "asset" }>,
  ): void;
}

// Plans kiln's stylesheets from the chunk graph of each Rollup or Rolldown output with `extract`, emits them as assets
// and makes every chunk load its own, as `LOADER` describes. Only ES module output can wait for a sheet, so other
// formats get one sheet per entry that the page has to link; the manifest lists every sheet for that.
export function rollupSplit(
  options: TransformOptions,
  compiles: (id: string) => boolean,
): { record(id: string, rules: Rules): void; hooks: Hooks } {
  const build = createBuild();
  // Rollup renders the outputs of one build concurrently, and passes each output's hooks the same options object.
  const outputs = new WeakMap<OutputOptions, Output>();
  // The manifest each output of this build wrote, by its path, to tell an output that would overwrite another's from
  // the same output written again.
  const manifests = new Map<string, string>();

  const planOf = (context: Context, output: Output, chunks: Record<string, RenderedChunk>) => {
    if (output.plan) return output.plan;
    const mode: Mode = output.esm ? splitMode(options) : "single";
    const graph = graphOf(chunks, process.cwd());
    const sheets = emitSheets(build, graph, mode, options, compiles, (source) =>
      context.getFileName(context.emitFile({ type: "asset", name: "kiln.css", source })),
    );
    const plan: Plan = { graph, sheets, loads: new Map(), loaders: new Map(), exports: new Map() };
    const needs = (key: string) => {
      if (sheets.has(key)) return true;
      const loaded = new Set(loadsOf(plan, key));
      return graph.get(key)!.dynamicImports.some((target) => loadsOf(plan, target).some((file) => !loaded.has(file)));
    };
    const needing = new Set([...graph.keys()].filter(needs));
    const first = (a: string, b: string) => (graph.get(a)!.stableName < graph.get(b)!.stableName ? a : b);
    for (const key of needing) {
      const closure = new Set([key]);
      for (const current of closure)
        for (const next of graph.get(current)!.imports) if (graph.has(next)) closure.add(next);
      const holder = [...closure].filter((other) => needing.has(other)).reduce(first);
      const imported = holder !== key && graph.get(key)!.imports.includes(holder);
      plan.loaders.set(key, imported ? holder : key);
      if (imported && !plan.exports.has(holder)) {
        plan.exports.set(
          holder,
          nameFree((name) => chunks[holder]!.exports.includes(name)),
        );
      }
    }
    return (output.plan = plan);
  };

  // The sheets that arrive with a chunk: those of the chunks in its static closure, imports first, as they run.
  const loadsOf = ({ graph, sheets, loads }: Plan, key: string) => {
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
      closeBundle() {
        manifests.clear();
      },
      renderStart(outputOptions) {
        const esm = isESM(outputOptions.format);
        outputs.set(outputOptions, { esm, plan: null });
        if (!esm && splitMode(options) === "chunks") {
          this.warn(
            `[kiln] extract splits stylesheets by chunk only for ES module output, which can wait for them to load; ` +
              `this ${outputOptions.format} output gets one stylesheet per entry, which the page must link from ` +
              `${manifestFile(outputOptions.format)}.`,
          );
        }
      },
      renderChunk: {
        order: "post",
        async handler(code, chunk, outputOptions, { chunks }) {
          const output = outputs.get(outputOptions)!;
          const plan = planOf(this, output, chunks);
          if (!output.esm) return null;

          const loader = plan.loaders.get(chunk.fileName);
          if (!loader) return null;
          const dir = path.posix.dirname(chunk.fileName);
          // A running chunk has loaded the sheets of its own static closure already.
          const loaded = new Set(loadsOf(plan, chunk.fileName));
          const loadsWith = (target: string) => loadsOf(plan, target).filter((file) => !loaded.has(file));
          const own = plan.sheets.get(chunk.fileName);

          const local = nameFree((name) => code.includes(name));
          const call = (file: string) => `${local}(${JSON.stringify(path.posix.relative(dir, file))},import.meta.url)`;
          const s = new MagicString(code);
          if (chunk.dynamicImports.some((target) => loadsWith(target).length > 0)) {
            for (const { specifier, start, end } of await dynamicImportsOf(code, chunk.fileName)) {
              if (specifier === undefined) continue;
              const files = loadsWith(path.posix.join(dir, specifier));
              if (files.length === 0) continue;
              s.appendLeft(start, "(" + files.map((file) => call(file) + ",").join(""));
              s.appendRight(end, ")");
            }
          }
          const prologue = prologueOf(code, chunk.fileName);
          const from = path.posix.relative(dir, loader);
          const exported = plan.exports.get(loader);
          const declaration =
            loader !== chunk.fileName
              ? `import{${binding(exported!, local)}}from${JSON.stringify(from.startsWith(".") ? from : "./" + from)};`
              : loaderSource(local) + (exported ? `export{${binding(local, exported)}};` : "");
          s.appendLeft(
            prologue,
            (prologue > 0 ? "\n" : "") + declaration + "\n" + (own ? `await ${call(own)};\n` : ""),
          );
          return {
            code: s.toString(),
            map: outputOptions.sourcemap ? s.generateMap({ hires: "boundary", includeContent: true }) : null,
          };
        },
      },
      generateBundle(outputOptions, bundle) {
        const output = outputs.get(outputOptions);
        outputs.delete(outputOptions);
        const chunks = Object.values(bundle).filter((file): file is OutputChunk => file.type === "chunk");
        const inBundle = (file: string) => bundle[file]?.type === "chunk";
        const manifest: Record<string, ManifestChunk> = {};
        for (const chunk of chunks) {
          const css = output?.plan ? loadsOf(output.plan, chunk.preliminaryFileName) : [];
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
        const fileName = manifestFile(outputOptions.format);
        const source = JSON.stringify(manifest, null, 2) + "\n";
        const dir = outputOptions.dir ?? (outputOptions.file && path.dirname(outputOptions.file));
        if (dir) {
          const where = path.resolve(dir, fileName);
          if ((manifests.get(where) ?? source) !== source) {
            this.error(
              `[kiln] two ${outputOptions.format} outputs write ${fileName} to ${dir}, so one would overwrite the ` +
                `other's; give each its own directory.`,
            );
          }
          manifests.set(where, source);
        }
        this.emitFile({ type: "asset", fileName, source });
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

  // Declares the loader in a page whose head holds `links`, and loads sheets as a chunk at `CHUNK` would.
  const CHUNK = "https://example.com/app/main.js";
  function loader(links: Link[] = []) {
    vi.stubGlobal("document", {
      head: { append: (link: Link) => void links.push(link) },
      createElement: () => new Link(),
      querySelectorAll: () => links.filter((link) => link.rel === "stylesheet"),
    });
    const css = runInThisContext(`(${loaderSource(LOADER)})`) as (file: string, base: string) => unknown;
    // Another chunk's copy of the loader.
    const other = runInThisContext(`(${loaderSource(LOADER)})`) as (file: string, base: string) => unknown;
    return {
      load: (file: string) => css(file, CHUNK),
      other: (file: string, base: string) => other(file, base),
      links,
      url: (file: string) => new URL(file, CHUNK).href,
    };
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
      const { load, other, links, url } = loader();
      const loading = load("assets/kiln.css");
      expect(load("./assets/kiln.css")).toBe(loading);
      expect(other("../app/assets/kiln.css", CHUNK)).toBe(loading);
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

  describe("prologueOf", () => {
    it("ends after a hashbang and the directives that follow it, comments included", () => {
      const prologue = `#!/usr/bin/env node\n/* banner */\n"use strict";\n// note\n'use client'\n`;
      expect(prologueOf(prologue + "export {};", "a.js")).toBe(prologue.lastIndexOf("'") + 1);
      expect(prologueOf("#!/usr/bin/env node\nexport {};", "a.js")).toBe("#!/usr/bin/env node".length);
    });

    it("leaves a string that does not stand alone as code", () => {
      expect(prologueOf(`"use strict".length;\n`, "a.js")).toBe(0);
      expect(prologueOf(`export const s = "use strict";\n`, "a.js")).toBe(0);
    });
  });

  describe("rollupSplit", () => {
    const chunk = (fileName: string, fields: Partial<RenderedChunk>): RenderedChunk => ({
      fileName,
      moduleIds: ["/" + fileName],
      modules: { ["/" + fileName]: { renderedLength: 1 } },
      imports: [],
      dynamicImports: [],
      exports: [],
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

    it("loads the sheets of a chunk's static imports before its own, at its dynamic imports and in the manifest", async () => {
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
        error: (message) => expect.unreachable(message),
      };
      const outputOptions = { format: "es" };
      split.hooks.renderStart.call(context, outputOptions);
      const render = async (fileName: keyof typeof chunks, code: string) =>
        (await split.hooks.renderChunk.handler.call(context, code, chunks[fileName], outputOptions, { chunks }))?.code;

      const main = await render(
        "main.js",
        `export const go = () => [import("./page.js"), import('./widget.js')];\n// import("./page.js")\n`,
      );
      const sheetWith = (color: string) => [...emitted].find(([, css]) => css.includes(`color:${color}`))![0];
      const [red, blue, green] = [sheetWith("red"), sheetWith("blue"), sheetWith("green")];
      const load = (file: string) => `__kiln$css("${file}",import.meta.url)`;
      expect(main).toContain(`await __kiln$css("${red}",import.meta.url);`);
      expect(main).toContain(`(${load(green)},${load(blue)},import("./page.js"))`);
      expect(main).toContain(`(${load(green)},import('./widget.js'))`);
      expect(main).toContain(`\n// import("./page.js")\n`);
      expect(await render("page.js", "export {};\n")).toContain(`await __kiln$css("${blue}",import.meta.url);`);

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

    it("names the loader so that it collides with no binding a chunk or its exports already have", async () => {
      const split = rollupSplit({ extract: true }, () => false);
      split.record("/a.js", compileEntry("color", "red")[2]);
      split.record("/b.js", compileEntry("color", "blue")[2]);
      const emitted: string[] = [];
      const context: Context = {
        emitFile: ({ source }) => String(emitted.push(source) - 1),
        getFileName: (ref) => `assets/kiln-${ref}.css`,
        warn: (message) => expect.unreachable(message),
        error: (message) => expect.unreachable(message),
      };
      // `b` imports `a`, which comes first, so `a` exports the loader for `b`; both already bundle a kiln build's loader.
      const chunks = {
        "a.js": chunk("a.js", { isEntry: true, exports: ["__kiln$css"] }),
        "b.js": chunk("b.js", { isEntry: true, imports: ["a.js"] }),
      };
      const outputOptions = { format: "es" };
      split.hooks.renderStart.call(context, outputOptions);
      const render = async (fileName: keyof typeof chunks) =>
        (await split.hooks.renderChunk.handler.call(
          context,
          "function __kiln$css(){}\nexport { __kiln$css };\n",
          chunks[fileName],
          outputOptions,
          { chunks },
        ))!.code;
      const a = await render("a.js");
      expect(a).toMatch(
        /^function __kiln\$css1\(f,b\)\{.*\}export\{__kiln\$css1\};\nawait __kiln\$css1\("assets\/kiln-0\.css"/,
      );
      expect(await render("b.js")).toMatch(
        /^import\{__kiln\$css1\}from"\.\/a\.js";\nawait __kiln\$css1\("assets\/kiln-1\.css"/,
      );
    });
  });
}
