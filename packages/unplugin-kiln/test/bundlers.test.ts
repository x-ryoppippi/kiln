import { compileEntry, LAYER_ORDER, type Entry } from "kiln/core";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

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

function expectExtracted({ js, css }: { js: string; css: string }) {
  const output = normalise(js);
  const styles = normalise(css);
  expect(styles.startsWith(normalise(LAYER_ORDER))).toBe(true);
  for (const [key, className, rules] of compiledEntries) {
    expect(output).toContain(normalise(JSON.stringify([key, className, []])));
    for (const [, text] of rules) {
      expect(output).not.toContain(normalise(JSON.stringify(text)));
      expect(styles).toContain(normalise(text));
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
