import { compileEntry, LAYER_ORDER, type Entry } from "kiln/core";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import { MANIFEST, manifestFile, type ManifestChunk } from "../src/index.ts";
import { bundle, BUNDLERS } from "./helpers/bundle.ts";
import { splitter } from "./helpers/split.ts";

// Bundlers reprint code with their own spacing, quotes and trailing semicolons, so compare without them.
const normalise = (code: string) =>
  code
    .replace(/\/\*.*?\*\//gs, "")
    .replace(/\s+/g, "")
    .replaceAll("'", '"')
    .replaceAll(";}", "}");

const compiledEntries: Entry[] = [
  compileEntry("display", "flex"),
  compileEntry("padding", 16),
  compileEntry("@media (min-width: 600px)", { padding: 24 }),
  compileEntry("margin", 0),
  compileEntry("color", "red"),
  compileEntry(":hover", { color: "blue" }),
];

// A rule is `@layer kN{body}`; kiln's own Vite sheets put every rule of a layer in one block.
function expectRule(styles: string, text: string) {
  const [, layer, body] = /^@layer(k\d+)\{(.*)\}$/s.exec(normalise(text))!;
  const at = styles.indexOf(body!);
  expect(at, text).toBeGreaterThanOrEqual(0);
  expect(
    styles
      .slice(0, at)
      .match(/@layer(k\d+)\{/g)
      ?.at(-1),
    text,
  ).toBe(`@layer${layer}{`);
}

function expectExtracted({ js, css }: { js: string; css: string }) {
  const output = normalise(js);
  const styles = normalise(css);
  expect(styles.startsWith(normalise(LAYER_ORDER))).toBe(true);
  for (const [key, className, rules] of compiledEntries) {
    expect(output).toContain(normalise(JSON.stringify([key, className, []])));
    for (const [, text] of rules) {
      expect(output).not.toContain(normalise(JSON.stringify(text)));
      expectRule(styles, text);
    }
  }
}

describe.each(BUNDLERS)("%s", (bundler) => {
  it("inlines compiled entries with their rules", async () => {
    const { js, css } = await bundle(bundler, {});
    const output = normalise(js);
    for (const entry of compiledEntries) expect(output).toContain(normalise(JSON.stringify(entry)));
    expect(output).not.toContain('display:"flex"');
    expect(output).toContain("color:tone");
    expect(css).toBe("");
  });

  it("extracts rules into a CSS asset that declares the layer order first", async () => {
    expectExtracted(await bundle(bundler, { extract: true }));
  });
});

describe.each(["webpack", "rspack"] as const)("%s with native CSS", (bundler) => {
  it("extracts rules into a CSS asset through an explicit css rule", async () => {
    expectExtracted(await bundle(bundler, { extract: true }, { nativeCSS: "rule" }));
  });
});

// Lightning CSS folds the leading order statement into the layer blocks after it, so compare the order
// in which layers are first declared rather than the statement itself.
const declaredLayers = (css: string) => [
  ...new Set(
    (css.match(/(?<=@layer\s+)[^{;]+/g) ?? []).flatMap((names) => names.split(",").map((name) => name.trim())),
  ),
];

describe("rsbuild with Lightning CSS", () => {
  it("extracts rules into a CSS asset that keeps the layer order", async () => {
    const { js, css } = await bundle("rsbuild", { extract: true }, { lightningcss: true });
    expect(declaredLayers(css)).toEqual(declaredLayers(LAYER_ORDER));
    for (const [key, className] of compiledEntries) {
      expect(normalise(js)).toContain(normalise(JSON.stringify([key, className, []])));
      expect(css).toContain("." + className);
    }
  });
});

describe("webpack with its default CSS rules", () => {
  // unplugin's load rule sets `type: "javascript/auto"` and outranks webpack's default `.css` rule,
  // so the virtual CSS module is parsed as JavaScript. A user rule declaring the type wins again.
  it.fails("extracts rules into a CSS asset", async () => {
    expectExtracted(await bundle("webpack", { extract: true }, { nativeCSS: "default" }));
  });
});

describe("vite with an inline module script", () => {
  // Vite names the script `index.html?html-proxy&index=0.js`, whose JS extension is only in the query.
  it("extracts its rules", async () => {
    const { js, css } = await bundle("vite", { extract: true }, { html: true });
    const [, className, rules] = compileEntry("color", "teal");
    expect(normalise(js)).toContain(`"${className}",[]]`);
    expect(css).toContain(rules[0]![1]);
  });
});

describe("query variants", () => {
  // The split fixture: `shared` stays in the module, `component` moves to its `?split=component` variant.
  const shared = [compileEntry("outline", "3px solid orange")];
  const component = [compileEntry("color", "tomato"), compileEntry("letterSpacing", 2)];
  const classesOf = (entries: Entry[]) => entries.map(([, className]) => className);
  const sheets = (files: Record<string, string>) => Object.entries(files).filter(([name]) => name.endsWith(".css"));

  // Classes of the entries kiln compiled with their rules extracted, as they appear in the JS output.
  const extractedClasses = (js: string) =>
    new Set([...normalise(js).matchAll(/"(k[0-9a-z]+)",\[\]\]/g)].map((match) => match[1]!));

  describe.each(["vite", "rollup", "rolldown", "webpack", "rspack"] as const)("%s", (bundler) => {
    it("ships a rule for every class the JS references", async () => {
      const { js, files } = await bundle(bundler, { extract: true }, { split: true });
      const referenced = extractedClasses(js);
      expect([...referenced]).toEqual(expect.arrayContaining(classesOf([...shared, ...component])));
      const styles = sheets(files).map(([, text]) => text);
      const missing = [...referenced].filter((className) => !styles.some((css) => css.includes("." + className)));
      expect(missing).toEqual([]);
    });

    it("starts every CSS asset with the full layer order", async () => {
      const { files } = await bundle(bundler, { extract: true }, { split: true });
      expect(sheets(files).length).toBeGreaterThan(0);
      for (const [, css] of sheets(files)) expect(declaredLayers(css)).toEqual(declaredLayers(LAYER_ORDER));
    });
  });

  describe("vite", () => {
    it.each([false, true])("keeps the full layer order in every CSS asset with cssMinify %s", async (cssMinify) => {
      const { files } = await bundle("vite", { extract: true }, { split: true, cssMinify });
      expect(sheets(files).length).toBeGreaterThan(1);
      for (const [, css] of sheets(files)) expect(declaredLayers(css)).toEqual(declaredLayers(LAYER_ORDER));
    });

    it("keeps a variant's CSS module across HMR timestamps in dev", async () => {
      const { createServer } = await import("vite-plus");
      const { default: kiln } = await import("../src/vite.ts");
      const route = fileURLToPath(new URL("fixtures/split/route.js", import.meta.url));
      const server = await createServer({
        configFile: false,
        logLevel: "silent",
        root: path.dirname(route),
        plugins: [splitter(), kiln({ extract: true })],
        // Resolve kiln to its sources, as the workspace's own config does, so the test needs no build.
        resolve: { conditions: ["source"] },
        server: { middlewareMode: true, hmr: false, ws: false },
      });
      try {
        const cssImport = async (url: string) =>
          /route\.js\.v[0-9a-z]+\.kiln\.css/.exec((await server.transformRequest(url))!.code)?.[0];
        const variant = await cssImport(route + "?split=component");
        expect(variant).toBeDefined();
        // The client re-imports an updated module with `t=<Date.now()>`, which Vite drops from the module id.
        expect(await cssImport(`${route}?split=component&t=${Date.now()}`)).toBe(variant);
        const css = (await server.transformRequest(path.join(path.dirname(route), variant!)))!.code;
        for (const className of classesOf(component)) expect(css).toContain(className);
      } finally {
        await server.close();
      }
    });

    it("puts the split component's rules in the lazy chunk's CSS, not the entry's", async () => {
      const { files } = await bundle("vite", { extract: true }, { split: true });
      const manifest: Record<string, { css?: string[]; isEntry?: boolean; isDynamicEntry?: boolean }> = JSON.parse(
        files[".vite/manifest.json"]!,
      );
      const cssOf = (predicate: (chunk: { isEntry?: boolean; isDynamicEntry?: boolean }) => boolean) =>
        Object.values(manifest)
          .filter(predicate)
          .flatMap((chunk) => chunk.css ?? [])
          .map((name) => files[name]!)
          .join("\n");
      const entry = cssOf((chunk) => chunk.isEntry === true);
      const lazy = cssOf((chunk) => chunk.isDynamicEntry === true);
      for (const className of classesOf(shared)) expect(entry).toContain("." + className);
      for (const className of classesOf(component)) {
        expect(lazy).toContain("." + className);
        expect(entry).not.toContain("." + className);
      }
    });
  });
});

// The rules of the `routes` fixture's modules.
const rulesOf = (...entries: Entry[]) => entries.map(([, className]) => className);
const shell = rulesOf(compileEntry("display", "flex"), compileEntry("margin", 0));
const breakpoints = [
  compileEntry("@media (min-width: 600px)", { padding: 8 }),
  compileEntry("@media (min-width: 900px)", { padding: 16 }),
];
const card = rulesOf(compileEntry("padding", 0), compileEntry("borderRadius", 4), ...breakpoints);
const about = rulesOf(compileEntry("color", "teal"));
const blog = rulesOf(compileEntry("color", "navy"), compileEntry("gap", 4));
const post = rulesOf(compileEntry("fontStyle", "italic"));
const classes = (css: string) => [...css.matchAll(/\.(k[0-9a-z]+)\{/g)].map((match) => match[1]!).sort();

describe("vite with kiln's own stylesheets", () => {
  type Manifest = Record<string, { file: string; css?: string[] }>;
  const build = () => bundle("vite", { extract: true }, { routes: true });

  it("gives each entry and lazy page one sheet with only the rules it adds", async () => {
    const { files } = await build();
    const manifest: Manifest = JSON.parse(files[".vite/manifest.json"]!);
    const sheetOf = (key: string) => {
      expect(manifest[key]!.css, key).toHaveLength(1);
      return manifest[key]!.css![0]!;
    };
    expect(classes(files[sheetOf("index.html")]!)).toEqual(shell.sort());
    expect(classes(files[sheetOf("about.js")]!)).toEqual([...card, ...about].sort());
    expect(classes(files[sheetOf("blog.js")]!)).toEqual([...card, ...blog].sort());
    expect(classes(files[sheetOf("post.js")]!)).toEqual(post);

    expect([...files["index.html"]!.matchAll(/<link rel="stylesheet"[^>]*href="\/([^"]+)"/g)].map((m) => m[1])).toEqual(
      [sheetOf("index.html")],
    );
    const mapDeps = (key: string) => /const __vite__mapDeps=.*\n/.exec(files[manifest[key]!.file]!)![0];
    expect(mapDeps("index.html")).toContain(JSON.stringify(sheetOf("about.js")));
    expect(mapDeps("index.html")).toContain(JSON.stringify(sheetOf("blog.js")));
    expect(mapDeps("blog.js")).toContain(JSON.stringify(sheetOf("post.js")));
    for (const [name, css] of Object.entries(files)) {
      if (name.endsWith(".css")) expect(css.startsWith(LAYER_ORDER + "\n"), name).toBe(true);
    }
  });

  it("keeps rules of one layer in source order, which decides between overlapping media queries", async () => {
    const { files } = await build();
    const manifest: Manifest = JSON.parse(files[".vite/manifest.json"]!);
    const css = files[manifest["about.js"]!.css![0]!]!;
    const [narrow, wide] = breakpoints.map(([, className]) => css.indexOf(`.${className}{`));
    expect(narrow).toBeGreaterThan(0);
    expect(wide).toBeGreaterThan(narrow!);
  });

  it("builds byte-identical output twice", async () => {
    expect(await build()).toEqual(await build());
  });

  it.each([
    ['split: "single"', { extract: { split: "single" } }, {}],
    ["build.cssCodeSplit: false", { extract: true }, { cssCodeSplit: false }],
  ] as const)("puts every rule an entry reaches in its one sheet with %s", async (_, options, config) => {
    const { files } = await bundle("vite", options, { routes: true, ...config });
    const sheets = Object.keys(files).filter((name) => name.endsWith(".css"));
    expect(sheets).toHaveLength(1);
    expect(classes(files[sheets[0]!]!)).toEqual([...shell, ...card, ...about, ...blog, ...post].sort());
    const manifest: Manifest = JSON.parse(files[".vite/manifest.json"]!);
    expect(manifest["index.html"]!.css).toEqual(sheets);
  });
});

describe.each(["rollup", "rolldown"] as const)("%s with kiln's own stylesheets", (bundler) => {
  const build = (options: Parameters<typeof bundle>[1] = { extract: true }, format?: "es" | "cjs") =>
    bundle(bundler, options, { routes: true, format });
  const manifestOf = (files: Record<string, string>): Record<string, ManifestChunk> =>
    JSON.parse(files[MANIFEST] ?? files[manifestFile("cjs")]!);
  // Chunks are named after their module, with a hash unless they are the entry.
  const chunkOf = (files: Record<string, string>, name: string) => {
    const chunk = Object.values(manifestOf(files)).find((chunk) =>
      new RegExp(`^${name}(-[\\w-]+)?\\.js$`).test(chunk.file),
    );
    expect(chunk, name).toBeDefined();
    return chunk!;
  };
  // The sheets a chunk adds to those its static imports load.
  const ownSheets = (files: Record<string, string>, name: string) => {
    const manifest = manifestOf(files);
    const { css = [], imports = [] } = chunkOf(files, name);
    const imported = new Set(imports.flatMap((file) => manifest[file]!.css ?? []));
    return css.filter((file) => !imported.has(file));
  };
  const sheetOf = (files: Record<string, string>, name: string) => {
    const own = ownSheets(files, name);
    expect(own, name).toHaveLength(1);
    return own[0]!;
  };
  const args = (file: string) => `(${JSON.stringify(file)},import.meta.url)`;

  it("gives each entry and lazy page one sheet with only the rules it adds", async () => {
    const { files } = await build();
    expect(classes(files[sheetOf(files, "main")]!)).toEqual([...shell].sort());
    expect(classes(files[sheetOf(files, "about")]!)).toEqual([...card, ...about].sort());
    expect(classes(files[sheetOf(files, "blog")]!)).toEqual([...card, ...blog].sort());
    expect(classes(files[sheetOf(files, "post")]!)).toEqual(post);
    expect(ownSheets(files, "card")).toEqual([]);
    for (const [name, css] of Object.entries(files)) {
      if (name.endsWith(".css")) expect(css.startsWith(LAYER_ORDER + "\n"), name).toBe(true);
    }
  });

  it("makes each chunk wait for its sheet, and a dynamic import start loading it", async () => {
    const { files } = await build();
    const code = (name: string) => normalise(files[chunkOf(files, name).file]!);
    for (const name of ["main", "about", "blog", "post"]) {
      expect(code(name), name).toContain(normalise(`await __kiln$css${args(sheetOf(files, name))};`));
    }
    expect(code("card")).not.toContain("__kiln$css(");
    const imports = (name: string) =>
      normalise(`(__kiln$css${args(sheetOf(files, name))},import("./${chunkOf(files, name).file}"))`);
    expect(code("main")).toContain(imports("about"));
    expect(code("main")).toContain(imports("blog"));
    expect(code("blog")).toContain(imports("post"));
  });

  it("declares the loader once in each chunk that loads a sheet, since none of them imports another", async () => {
    const { files } = await build();
    const declarations = (name: string) => files[chunkOf(files, name).file]!.match(/function __kiln\$css\(/g) ?? [];
    for (const name of ["main", "about", "blog", "post"]) expect(declarations(name), name).toHaveLength(1);
    expect(declarations("card")).toEqual([]);
  });

  it("keeps rules of one layer in source order, which decides between overlapping media queries", async () => {
    const { files } = await build();
    const css = files[sheetOf(files, "about")]!;
    const [narrow, wide] = breakpoints.map(([, className]) => css.indexOf(`.${className}{`));
    expect(narrow).toBeGreaterThan(0);
    expect(wide).toBeGreaterThan(narrow!);
  });

  it("builds byte-identical output twice", async () => {
    expect(await build()).toEqual(await build());
  });

  it('puts every rule the entry reaches in its one sheet with split: "single"', async () => {
    const { files, js } = await build({ extract: { split: "single" } });
    const sheets = Object.keys(files).filter((name) => name.endsWith(".css"));
    expect(sheets).toEqual([sheetOf(files, "main")]);
    expect(classes(files[sheets[0]!]!)).toEqual([...shell, ...card, ...about, ...blog, ...post].sort());
    // The entry's await and the loader it declares; no dynamic import has a sheet to start.
    expect(js.match(/await __kiln\$css\(/g)).toHaveLength(1);
    expect(js.match(/__kiln\$css\(/g)).toHaveLength(2);
  });

  it("gives an output that cannot wait for a sheet one per entry, for the page to link", async () => {
    const { files, js, warnings } = await build({ extract: true }, "cjs");
    const sheets = Object.keys(files).filter((name) => name.endsWith(".css"));
    expect(sheets).toEqual([sheetOf(files, "main")]);
    expect(classes(files[sheets[0]!]!)).toEqual([...shell, ...card, ...about, ...blog, ...post].sort());
    expect(js).not.toContain("__kiln$css");
    expect(warnings).toEqual([expect.stringContaining("this cjs output gets one stylesheet per entry")]);
  });
});

describe("rollup with an ES and a CommonJS output rendered together", () => {
  it("plans and emits each output's sheets on its own", async () => {
    const { rollup } = await import("rollup");
    const { default: kiln } = await import("../src/rollup.ts");
    const build = await rollup({
      input: fileURLToPath(new URL("fixtures/routes/main.js", import.meta.url)),
      external: /^kiln(\/|$)/,
      plugins: [kiln({ extract: true })],
      onwarn: () => {},
    });
    const [es, cjs] = await Promise.all([build.generate({ format: "es" }), build.generate({ format: "cjs" })]);
    await build.close();
    const sheetsOf = (output: typeof es.output) => output.filter((file) => file.fileName.endsWith(".css"));
    const listed = (output: typeof es.output, format: string) => {
      const manifest = output.find((file) => file.fileName === manifestFile(format));
      const chunks: Record<string, ManifestChunk> = JSON.parse(
        manifest?.type === "asset" ? String(manifest.source) : "{}",
      );
      return [...new Set(Object.values(chunks).flatMap((chunk) => chunk.css ?? []))].sort();
    };
    expect(sheetsOf(es.output)).toHaveLength(4);
    expect(sheetsOf(cjs.output)).toHaveLength(1);
    expect(listed(es.output, "es")).toEqual(
      sheetsOf(es.output)
        .map((file) => file.fileName)
        .sort(),
    );
    expect(listed(cjs.output, "cjs")).toEqual(
      sheetsOf(cjs.output)
        .map((file) => file.fileName)
        .sort(),
    );
    const js = (output: typeof es.output) =>
      output.flatMap((file) => (file.type === "chunk" ? [file.code] : [])).join("\n");
    expect(js(es.output)).toContain("await __kiln$css(");
    expect(js(cjs.output)).not.toContain("__kiln$css");
  });
});
