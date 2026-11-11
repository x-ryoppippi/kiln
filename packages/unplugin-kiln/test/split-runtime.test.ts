// Runs Rollup's and Rolldown's split output as a page would, against a stand-in DOM whose stylesheets load a tick
// after they are linked, to check when each sheet loads relative to the code that needs it.
import { cp, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { MANIFEST, type ManifestChunk, type Options } from "../src/index.ts";

const ROUTES = fileURLToPath(new URL("fixtures/routes/main.js", import.meta.url));
// An entry without rules of its own that imports a page with some.
const LAZY_ONLY = fileURLToPath(new URL("fixtures/lazy-only/main.js", import.meta.url));
// Two entries: `main` imports `vendor`, which imports `ui`, which imports `tone`, which goes with `vendor`. `admin`
// imports `ui` lazily, so `ui` has a sheet of its own; `vendor` imports `extra` lazily as it runs.
const CYCLE = fileURLToPath(new URL("fixtures/cycle/main.js", import.meta.url));
const CYCLE_ADMIN = fileURLToPath(new URL("fixtures/cycle/admin.js", import.meta.url));
// An entry with a hashbang and a directive.
const PROLOGUE = fileURLToPath(new URL("fixtures/prologue/main.js", import.meta.url));
// An entry with a template literal that reads like the dynamic import it has.
const DECOY = fileURLToPath(new URL("fixtures/decoy/main.js", import.meta.url));
const DECOY_PAGE = fileURLToPath(new URL("fixtures/decoy/page.js", import.meta.url));
// An entry that binds `document`, `URL` and `Promise` at module level, as the browser globals are named.
const SHADOW = fileURLToPath(new URL("fixtures/shadow/main.js", import.meta.url));
// An entry with JSX, whose text reads like the dynamic import it has.
const JSX = fileURLToPath(new URL("fixtures/jsx/main.jsx", import.meta.url));
const normalise = (code: string) => code.replace(/\s+/g, "").replaceAll("'", '"');
// kiln's runtime as far as the fixture uses it: `css()` reports the classes it is given. Builds keep it external, as an
// app keeps a package that its pages share, and write it next to the output.
const RUNTIME = `export const __k = (entries) => entries;
export const css = (...entries) => globalThis.log.push("run " + entries.flat().map(([, name]) => name).join(" "));
`;
const RUNTIME_FILE = "kiln.js";

interface BuildOptions {
  input?: string | string[];
  extract?: Options["extract"];
  /** Rollup or Rolldown input options on top of the input and plugins, such as `external`. */
  inputOptions?: Record<string, unknown>;
  /** Output options on top of the directory and format, such as Rolldown's `strictExecutionOrder`. */
  outputOptions?: Record<string, unknown>;
  /** Plugins after kiln, such as a minifier. */
  plugins?: object[];
}

async function build(
  bundler: "rollup" | "rolldown",
  dir: string,
  { input = ROUTES, extract = true, inputOptions, outputOptions, plugins = [] }: BuildOptions = {},
) {
  const { [bundler]: create } = (await import(bundler)) as unknown as Record<string, (options: object) => Promise<any>>;
  const { default: kiln } = await import(`../src/${bundler}.ts`);
  const bundle = await create!({
    input,
    external: ["kiln"],
    plugins: [kiln({ extract }), ...plugins],
    onwarn: () => {},
    onLog: () => {},
    ...inputOptions,
  });
  await bundle.write({ dir, format: "es", paths: { kiln: `./${RUNTIME_FILE}` }, ...outputOptions });
  await bundle.close();
  await writeFile(path.join(dir, RUNTIME_FILE), RUNTIME);
}

interface Link {
  rel: string;
  href: string;
  onload?: () => void;
}

// A page whose stylesheets load a tick after they are linked; `log` records links, loads and the classes code uses.
function page(dir: string) {
  const log: string[] = [];
  const links: Link[] = [];
  const base = pathToFileURL(dir + "/").href;
  vi.stubGlobal("log", log);
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("__kiln$css", undefined);
  vi.stubGlobal("document", {
    head: {
      append(link: Link) {
        const file = link.href.slice(base.length);
        log.push("link " + file);
        links.push(link);
        setTimeout(() => {
          log.push("loaded " + file);
          link.onload?.();
        });
      },
    },
    createElement: (): Link => ({ rel: "", href: "" }),
    querySelectorAll: () => links.filter((link) => link.rel === "stylesheet"),
  });
  return { log, links };
}

const manifestOf = async (dir: string): Promise<Record<string, ManifestChunk>> =>
  JSON.parse(await readFile(path.join(dir, MANIFEST), "utf8"));

async function inDir(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(await realpath(tmpdir()), "kiln-runtime-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Loads the `routes` fixture built into `dir` and visits each route, checking that every chunk waits for its sheet and
// that each dynamic import starts loading the sheet before the chunk's JS runs.
async function visitRoutes(dir: string) {
  const manifest = await manifestOf(dir);
  const sheet = (name: string) => {
    const [file, chunk] = Object.entries(manifest).find(([file]) => file.startsWith(name))!;
    return { file, css: chunk.css!.at(-1)! };
  };

  const { log, links } = page(dir);
  await import(pathToFileURL(path.join(dir, "main.js")).href);
  const main = sheet("main.js").css;
  expect(log.filter((entry) => !entry.startsWith("run "))).toEqual([`link ${main}`, `loaded ${main}`]);

  const routes = Reflect.get(globalThis, "routes") as Record<string, () => Promise<unknown>>;
  log.length = 0;
  const blog = sheet("blog").css;
  const loading = routes.blog!();
  expect(log).toEqual([`link ${blog}`]);
  await loading;
  expect(log.indexOf(`loaded ${blog}`)).toBeGreaterThan(0);
  expect(log.indexOf(`loaded ${blog}`)).toBeLessThan(log.length - 1);
  expect(log.at(-1)).toMatch(/^run /);

  log.length = 0;
  await routes.about!();
  const about = sheet("about").css;
  expect(log.filter((entry) => !entry.startsWith("run "))).toEqual([`link ${about}`, `loaded ${about}`]);
  expect(log.at(-1)).toMatch(/^run /);

  expect(new Set(links.map((link) => link.href)).size).toBe(links.length);
}

// A renderChunk minifier, as rollup-plugin-esbuild and @rollup/plugin-terser run one.
function minify() {
  return {
    name: "minify",
    async renderChunk(code: string) {
      const { transform } = await import("esbuild");
      const { code: minified, map } = await transform(code, { minify: true, format: "esm", sourcemap: "external" });
      return { code: minified, map };
    },
  };
}

describe.each(["rollup", "rolldown"] as const)("%s output in a page", (bundler) => {
  afterEach(() => void vi.unstubAllGlobals());

  it("loads each chunk's sheet before it resolves, and starts it at the dynamic import", () =>
    inDir(async (dir) => {
      await build(bundler, dir);
      await visitRoutes(dir);
    }));

  it("defines the loader in an entry whose single sheet holds only rules it imports dynamically", () =>
    inDir(async (dir) => {
      await build(bundler, dir, { input: LAZY_ONLY, extract: { split: "single" } });
      const [sheet] = (await manifestOf(dir))["main.js"]!.css!;
      const { log } = page(dir);
      await import(pathToFileURL(path.join(dir, "main.js")).href);
      expect(log).toEqual([`link ${sheet}`, `loaded ${sheet}`]);
      await (Reflect.get(globalThis, "page") as () => Promise<unknown>)();
      expect(log.slice(2)).toEqual([expect.stringMatching(/^run /)]);
    }));

  it("starts loading a lazy chunk's sheet from an entry without rules of its own", () =>
    inDir(async (dir) => {
      await build(bundler, dir, { input: LAZY_ONLY });
      const manifest = await manifestOf(dir);
      expect(manifest["main.js"]!.css).toBeUndefined();
      const [, lazy] = Object.entries(manifest).find(([file]) => file.startsWith("page"))!;
      const sheet = lazy.css!.at(-1)!;
      const { log } = page(dir);
      await import(pathToFileURL(path.join(dir, "main.js")).href);
      const loading = (Reflect.get(globalThis, "page") as () => Promise<unknown>)();
      expect(log).toEqual([`link ${sheet}`]);
      await loading;
      expect(log).toEqual([`link ${sheet}`, `loaded ${sheet}`, expect.stringMatching(/^run /)]);
    }));

  it("loads the sheet of a chunk that runs before the chunk it imports, in a cycle of chunks", () =>
    inDir(async (dir) => {
      // Rollup's manualChunks, and Rolldown's groups without their dependencies, can put modules that import each other
      // in two chunks that do too.
      const groups = { ui: /[\\/]ui\.js$/, vendor: /[\\/](vendor|tone)\.js$/ };
      await build(bundler, dir, {
        input: [CYCLE, CYCLE_ADMIN],
        outputOptions:
          bundler === "rollup"
            ? { manualChunks: (id: string) => Object.keys(groups).find((name) => groups[name as "ui"].test(id)) }
            : {
                codeSplitting: {
                  includeDependenciesRecursively: false,
                  groups: Object.entries(groups).map(([name, test]) => ({ name, test })),
                },
              },
      });
      const manifest = await manifestOf(dir);
      const keyOf = (name: string) => Object.keys(manifest).find((file) => file.startsWith(name))!;
      const [ui, vendorChunk] = [keyOf("ui"), keyOf("vendor")];
      expect(manifest[vendorChunk]!.imports).toContain(ui);
      expect(manifest[ui]!.imports).toContain(vendorChunk);
      expect(manifest[ui]!.css?.length).toBeGreaterThan(0);
      // One of the two declares the loader and the other imports it, whichever runs first.
      const importsLoader = async (from: string, to: string) =>
        (await readFile(path.join(dir, from), "utf8"))
          .replace(/\s/g, "")
          .split(";")
          .some(
            (statement) =>
              statement.startsWith("import{") &&
              statement.endsWith(`from"./${to}"`) &&
              /[{,]__kiln\$css[,}]/.test(statement),
          );
      expect((await importsLoader(ui, vendorChunk)) || (await importsLoader(vendorChunk, ui))).toBe(true);

      // Each way in runs the chunks in another order, in a fresh copy of the output since a page runs a chunk once.
      for (const [entry, route] of [["main.js"], ["admin.js", "ui"]] as const) {
        await inDir(async (copy) => {
          await cp(dir, copy, { recursive: true });
          const { log } = page(copy);
          await import(pathToFileURL(path.join(copy, entry)).href);
          const target = route ? keyOf(route) : entry;
          if (route) await (Reflect.get(globalThis, "admin") as Record<string, () => Promise<unknown>>)[route]!();
          await Reflect.get(globalThis, "extra");
          expect(log, `${entry} ${route ?? ""}`).toEqual(
            expect.arrayContaining(manifest[target]!.css!.map((file) => `loaded ${file}`)),
          );
        });
      }
    }));

  it.runIf(bundler === "rolldown").each([
    ["strictExecutionOrder", { outputOptions: { strictExecutionOrder: true } }],
    [
      "experimentalInlineCommonChunks",
      {
        inputOptions: { preserveEntrySignatures: false },
        outputOptions: { codeSplitting: { experimentalInlineCommonChunks: { maxSize: Infinity } } },
      },
    ],
  ] as const)("loads sheets when %s wraps each module in a function that runs on first use", (_, options) =>
    inDir(async (dir) => {
      await build(bundler, dir, options);
      await visitRoutes(dir);
    }),
  );

  it("leaves no import for an `external` function to keep out of the bundle", () =>
    inDir(async (dir) => {
      await build(bundler, dir, { inputOptions: { external: (id: string) => !/^[./]/.test(id) } });
      await visitRoutes(dir);
    }));

  it("defines the loader once per chunk behind a renderChunk minifier", () =>
    inDir(async (dir) => {
      await build(bundler, dir, { plugins: [minify()] });
      for (const file of await readdir(dir)) {
        if (!file.endsWith(".js") || file === RUNTIME_FILE) continue;
        const code = await readFile(path.join(dir, file), "utf8");
        expect(code.split("querySelectorAll(").length - 1, file).toBeLessThanOrEqual(1);
      }
      await visitRoutes(dir);
    }));

  it("keeps a chunk's hashbang and directives first", () =>
    inDir(async (dir) => {
      // Rollup drops a module's directives, but keeps a banner's.
      await build(bundler, dir, {
        input: PROLOGUE,
        outputOptions: { chunkFileNames: "[name].js", ...(bundler === "rollup" && { banner: '"use client";' }) },
      });
      const code = await readFile(path.join(dir, "main.js"), "utf8");
      expect(code).toMatch(/^#!\/usr\/bin\/env node\n"use client";\n/);
      const sheet = (await manifestOf(dir))["page.js"]!.css!.at(-1)!;
      const { log } = page(dir);
      await import(pathToFileURL(path.join(dir, "main.js")).href);
      log.length = 0;
      const loading = (Reflect.get(globalThis, "page") as () => Promise<unknown>)();
      expect(log).toEqual([`link ${sheet}`]);
      await loading;
    }));

  it("rewrites only real dynamic imports, not text that reads like one", () =>
    inDir(async (dir) => {
      await build(bundler, dir, { input: DECOY, outputOptions: { chunkFileNames: "[name].js" } });
      const sheet = (await manifestOf(dir))["page.js"]!.css!.at(-1)!;
      const { log } = page(dir);
      const main = await import(pathToFileURL(path.join(dir, "main.js")).href);
      expect(main.label).toBe('import("./page.js")');
      const loading = (Reflect.get(globalThis, "page") as () => Promise<unknown>)();
      expect(log).toEqual([`link ${sheet}`]);
      await loading;
    }));

  it("loads sheets from a chunk that binds the names of the browser globals the loader uses", () =>
    inDir(async (dir) => {
      await build(bundler, dir, { input: SHADOW, outputOptions: { chunkFileNames: "[name].js" } });
      const manifest = await manifestOf(dir);
      const [own, lazy] = [manifest["main.js"]!.css!.at(-1)!, manifest["page.js"]!.css!.at(-1)!];
      const { log } = page(dir);
      await import(pathToFileURL(path.join(dir, "main.js")).href);
      expect(log.filter((entry) => !entry.startsWith("run "))).toEqual([`link ${own}`, `loaded ${own}`]);
      log.length = 0;
      await (Reflect.get(globalThis, "page") as () => Promise<unknown>)();
      expect(log).toEqual([`link ${lazy}`, `loaded ${lazy}`, expect.stringMatching(/^run /)]);
    }));

  it("rewrites a chunk whose JSX the build preserves", () =>
    inDir(async (dir) => {
      await build(bundler, dir, {
        input: JSX,
        inputOptions: bundler === "rollup" ? { jsx: "preserve" } : { transform: { jsx: "preserve" } },
        outputOptions: { chunkFileNames: "[name].js" },
      });
      const manifest = await manifestOf(dir);
      const [own, lazy] = [manifest["main.js"]!.css!.at(-1)!, manifest["page.js"]!.css!.at(-1)!];
      const code = normalise(await readFile(path.join(dir, "main.js"), "utf8"));
      expect(code).toContain(normalise(`await __kiln$css(${JSON.stringify(own)},import.meta.url);`));
      expect(code).toContain(normalise(`(__kiln$css(${JSON.stringify(lazy)},import.meta.url),import("./page.js"))`));
      expect(code).toContain(normalise(`Don't wait for import("./page.js") here</p>`));
    }));

  it("writes one manifest per output when outputs share a directory", () =>
    inDir(async (dir) => {
      const { [bundler]: create } = (await import(bundler)) as unknown as Record<string, (options: object) => any>;
      const { default: kiln } = await import(`../src/${bundler}.ts`);
      const bundle = await create!({
        input: ROUTES,
        external: ["kiln"],
        plugins: [kiln({ extract: true })],
        onwarn: () => {},
        onLog: () => {},
      });
      await Promise.all([
        bundle.write({ dir, format: "es" }),
        bundle.write({ dir, format: "cjs", entryFileNames: "[name].cjs", chunkFileNames: "[name]-[hash].cjs" }),
      ]);
      await bundle.close();
      const listed = await Promise.all(
        (await readdir(path.join(dir, ".kiln"))).map(async (file) =>
          Object.keys(JSON.parse(await readFile(path.join(dir, ".kiln", file), "utf8"))),
        ),
      );
      expect(listed).toEqual(
        expect.arrayContaining([expect.arrayContaining(["main.js"]), expect.arrayContaining(["main.cjs"])]),
      );
    }));

  it("fails rather than let two outputs overwrite each other's manifest", () =>
    inDir(async (dir) => {
      const { [bundler]: create } = (await import(bundler)) as unknown as Record<string, (options: object) => any>;
      const { default: kiln } = await import(`../src/${bundler}.ts`);
      const bundle = await create!({ input: ROUTES, external: ["kiln"], plugins: [kiln({ extract: true })] });
      await bundle.write({ dir, format: "es" });
      // Writing the same output again is fine.
      await bundle.write({ dir, format: "es" });
      await expect(bundle.write({ dir, format: "es", entryFileNames: "[name].mjs" })).rejects.toThrow(
        "two es outputs write .kiln/manifest.json",
      );
      await bundle.close();
    }));

  it("fails rather than let outputs that name files alike but chunk differently overwrite each other's manifest", () =>
    inDir(async (dir) => {
      const { [bundler]: create } = (await import(bundler)) as unknown as Record<string, (options: object) => any>;
      const { default: kiln } = await import(`../src/${bundler}.ts`);
      const bundle = await create!({ input: ROUTES, external: ["kiln"], plugins: [kiln({ extract: true })] });
      // With hashed entries the two outputs' files all differ, so only the manifest would be lost.
      const naming = { entryFileNames: "[name]-[hash].js" };
      await bundle.write({ dir, format: "es", ...naming });
      await expect(
        bundle.write({
          dir,
          format: "es",
          ...naming,
          ...(bundler === "rollup"
            ? { manualChunks: () => "app" }
            : { codeSplitting: { groups: [{ name: "app", test: /routes/ }] } }),
        }),
      ).rejects.toThrow("two es outputs write .kiln/manifest.json");
      await bundle.close();
    }));

  it("lets a watched build rewrite its manifest", () =>
    inDir(async (dir) => {
      const source = path.join(dir, "src");
      await cp(path.dirname(ROUTES), source, { recursive: true });
      const { watch } = (await import(bundler)) as unknown as Record<string, (options: object) => any>;
      const { default: kiln } = await import(`../src/${bundler}.ts`);
      const out = path.join(dir, "out");
      const watcher = await watch!({
        input: path.join(source, "main.js"),
        external: ["kiln"],
        plugins: [kiln({ extract: true })],
        output: { dir: out, format: "es", entryFileNames: "[name]-[hash].js" },
        onLog: () => {},
        watch: { skipWrite: false },
      });
      const events: string[] = [];
      const built = () =>
        new Promise<void>((resolve) => {
          const done = (event: { code: string; error?: Error; result?: { close(): unknown } }) => {
            if (event.code === "ERROR") events.push(String(event.error?.message));
            if (event.code === "BUNDLE_END" || event.code === "ERROR") void event.result?.close();
            if (event.code !== "END" && event.code !== "ERROR") return;
            watcher.off("event", done);
            resolve();
          };
          watcher.on("event", done);
        });
      try {
        await built();
        const first = await readFile(path.join(out, MANIFEST), "utf8");
        const rebuilt = built();
        await writeFile(
          path.join(source, "main.js"),
          (await readFile(path.join(source, "main.js"), "utf8")) + "\nwindow.edited = true;\n",
        );
        await rebuilt;
        expect(events).toEqual([]);
        expect(await readFile(path.join(out, MANIFEST), "utf8")).not.toBe(first);
      } finally {
        await watcher.close();
      }
    }));

  it("fails rather than let two single-file outputs overwrite each other's manifest", () =>
    inDir(async (dir) => {
      const { [bundler]: create } = (await import(bundler)) as unknown as Record<string, (options: object) => any>;
      const { default: kiln } = await import(`../src/${bundler}.ts`);
      const bundle = await create!({ input: DECOY_PAGE, external: ["kiln"], plugins: [kiln({ extract: true })] });
      await bundle.write({ file: path.join(dir, "page.js"), format: "es" });
      await expect(bundle.write({ file: path.join(dir, "page.min.js"), format: "es" })).rejects.toThrow(
        "two es outputs write .kiln/manifest.json",
      );
      await bundle.close();
    }));
});
