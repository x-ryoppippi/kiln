import { compileEntry, createTable, rankOfLayer, type Entry } from "../../src/core/index.ts";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import { MANIFEST, manifestFile, type ManifestChunk } from "../../src/unplugin/index.ts";
import { bundle, BUNDLERS, type Bundle, type Group } from "./helpers/bundle.ts";
import { splitter } from "./helpers/split.ts";

// Bundlers reprint code with their own spacing, quotes and trailing semicolons, so compare without them.
const normalise = (code: string) =>
  code
    .replace(/\/\*.*?\*\//gs, "")
    .replace(/\s+/g, "")
    .replaceAll("'", '"')
    .replaceAll(";}", "}");

const compiledEntries: Entry[] = [
  ...compileEntry("display", "flex"),
  ...compileEntry("padding", 16),
  ...compileEntry("@media (min-width: 600px)", { padding: 24 }),
  ...compileEntry("margin", 0),
  ...compileEntry("color", "red"),
  ...compileEntry(":hover", { color: "blue" }),
];

// A rule is `@layer nishiki.<name>{body}`; nishiki's own Vite sheets put every rule of a layer in one block.
function expectRule(styles: string, text: string) {
  const [, layer, body] = /^@layernishiki\.(n[0-9a-z]+(?:\.a)*)\{(.*)\}$/s.exec(normalise(text))!;
  const at = styles.indexOf(body!);
  expect(at, text).toBeGreaterThanOrEqual(0);
  expect(
    styles
      .slice(0, at)
      .match(/@layernishiki\.(n[0-9a-z]+(?:\.a)*)\{/g)
      ?.at(-1),
    text,
  ).toBe(`@layernishiki.${layer}{`);
}

// The rank layers inside nishiki's in the order the CSS first names them, which is the order they cascade in: from a
// statement `@layer nishiki{@layer a,b;}` or a block `@layer nishiki.a{`.
const declaredLayers = (css: string) => [
  ...new Set(
    [...css.matchAll(/@layer\s*nishiki\s*(?:\{\s*@layer\s*([^{};]+);|\.([^{\s]+)\s*\{)/g)].flatMap(([, names, block]) =>
      (names ?? block!).split(",").map((name) => name.trim().split(".")[0]!),
    ),
  ),
];

// Nishiki's layers cascade in rank order, starting from the base layer, all inside its one top-level layer.
function expectRanked(css: string) {
  expect(css).not.toMatch(/(?<!nishiki\s*\{\s*)@layer(?!\s*nishiki[\s.{])/);
  const layers = declaredLayers(css);
  expect(layers[0]).toBe("n0");
  expect(layers.map(rankOfLayer)).toEqual(layers.map(rankOfLayer).sort((a, b) => a - b));
}

function expectExtracted({ js, css }: { js: string; css: string }) {
  const output = normalise(js);
  const styles = normalise(css);
  expect(styles.startsWith("@layernishiki{@layern0")).toBe(true);
  expectRanked(css);
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
    // The runtime value compiles at runtime, in the layer the build ranked its key into.
    expect(output).toMatch(/color:(?:\(0,[\w$.]+\)|[\w$]+)\("color",tone,"n0"\)/);
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
describe("rsbuild with Lightning CSS", () => {
  it("extracts rules into a CSS asset that keeps the layer order", async () => {
    const { js, css } = await bundle("rsbuild", { extract: true }, { lightningcss: true });
    expectRanked(css);
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
    const [, className, rules] = compileEntry("color", "teal")[0]!;
    expect(normalise(js)).toContain(`"${className}",[]]`);
    expect(css).toContain(rules[0]![1]);
  });
});

describe("query variants", () => {
  // The split fixture: `shared` stays in the module, `component` moves to its `?split=component` variant.
  const shared = compileEntry("outline", "3px solid orange");
  const component = [...compileEntry("color", "tomato"), ...compileEntry("letterSpacing", 2)];
  const classesOf = (entries: Entry[]) => entries.map(([, className]) => className);
  const sheets = (files: Record<string, string>) => Object.entries(files).filter(([name]) => name.endsWith(".css"));

  // Classes of the entries nishiki compiled with their rules extracted, as they appear in the JS output.
  const extractedClasses = (js: string) =>
    new Set([...normalise(js).matchAll(/"(n[0-9a-z]+)",\[\]\]/g)].map((match) => match[1]!));

  describe.each(["vite", "rollup", "rolldown", "webpack", "rspack"] as const)("%s", (bundler) => {
    it("ships a rule for every class the JS references", async () => {
      const { js, files } = await bundle(bundler, { extract: true }, { split: true });
      const referenced = extractedClasses(js);
      expect([...referenced]).toEqual(expect.arrayContaining(classesOf([...shared, ...component])));
      const styles = sheets(files).map(([, text]) => text);
      const missing = [...referenced].filter((className) => !styles.some((css) => css.includes("." + className)));
      expect(missing).toEqual([]);
    });

    it("declares the layers of each CSS asset in rank order, or leaves them to a planned sheet that declares them", async () => {
      const { files } = await bundle(bundler, { extract: true }, { split: true });
      expect(sheets(files).length).toBeGreaterThan(0);
      const statement = (css: string) =>
        (/@layer\s*nishiki\s*\{\s*@layer\s+([^{;]+);/.exec(css)?.[1] ?? "")
          .split(",")
          .filter(Boolean)
          .map((name) => rankOfLayer(name.trim()));
      const used = (css: string) =>
        [...css.matchAll(/@layer\s*nishiki\.(n[0-9a-z]+)[.\w]*\s*\{/g)].map(([, name]) => rankOfLayer(name!));
      const declaring = sheets(files).filter(([, css]) => statement(css).length > 0);
      for (const [name, css] of sheets(files)) {
        const declared = statement(css);
        if (declared.length > 0) {
          expect(declared, name).toEqual([...declared].sort((a, b) => a - b));
          expect(
            used(css).filter((rank) => !declared.includes(rank)),
            name,
          ).toEqual([]);
        } else {
          // Only nishiki's own planned sheets leave the statement out, when another sheet always loads first.
          expect(["vite", "rollup", "rolldown", "webpack", "rspack"], name).toContain(bundler);
          const covered = used(css).every((rank) => declaring.some(([, other]) => statement(other).includes(rank)));
          expect(covered, name).toBe(true);
        }
      }
    });
  });

  describe("vite", () => {
    it.each([false, true])("keeps the layer order with cssMinify %s", async (cssMinify) => {
      const { files } = await bundle("vite", { extract: true }, { split: true, cssMinify });
      expect(sheets(files).length).toBeGreaterThan(1);
      expectRanked(
        sheets(files)
          .map(([, css]) => css)
          .join("\n"),
      );
    });

    it("keeps a variant's CSS module across HMR timestamps in dev", async () => {
      const { createServer } = await import("vite-plus");
      const { default: nishiki } = await import("../../src/unplugin/vite.ts");
      const route = fileURLToPath(new URL("fixtures/split/route.js", import.meta.url));
      const server = await createServer({
        configFile: false,
        logLevel: "silent",
        root: path.dirname(route),
        plugins: [splitter(), nishiki({ extract: true })],
        // Resolve nishiki to its sources, as the workspace's own config does, so the test needs no build.
        resolve: { conditions: ["source"] },
        server: { middlewareMode: true, hmr: false, ws: false },
      });
      try {
        const cssImport = async (url: string) =>
          /route\.js\.v[0-9a-z]+\.nishiki\.css/.exec((await server.transformRequest(url))!.code)?.[0];
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

// What a build warns about besides the conditions its fixtures leave unranked on purpose.
const buildWarnings = ({ warnings = [] }: { warnings?: string[] }) =>
  warnings.filter((warning) => !warning.includes("is not in conditions.order"));

// The `routes` fixture's card has rules at two widths, which these conditions rank.
const conditions = { breakpoints: ["600px", "900px"] };
const ranked = { table: createTable(conditions) };
// The rules of the `routes` fixture's modules.
const rulesOf = (...entries: Entry[]) => entries.map(([, className]) => className);
const shell = rulesOf(...compileEntry("display", "flex"), ...compileEntry("margin", 0));
// A rule's class names its layer, so the card's breakpoints get other classes once the widths are ranked.
const breakpointsOf = (context?: typeof ranked) => [
  ...compileEntry("@media (min-width: 600px)", { padding: 8 }, context),
  ...compileEntry("@media (min-width: 900px)", { padding: 16 }, context),
];
const cardOf = (context?: typeof ranked) =>
  rulesOf(...compileEntry("padding", 0), ...compileEntry("borderRadius", 4), ...breakpointsOf(context));
const card = cardOf();
const about = rulesOf(...compileEntry("color", "teal"));
const blog = rulesOf(...compileEntry("color", "navy"), ...compileEntry("gap", 4));
const post = rulesOf(...compileEntry("fontStyle", "italic"));
const layerOf = (css: string, className: string) =>
  [...css.slice(0, css.indexOf(`.${className}{`)).matchAll(/@layer nishiki\.(n[0-9a-z]+)/g)].at(-1)![1]!;
const classes = (css: string) => [...css.matchAll(/(?<!nishiki)\.(n[0-9a-z]+)\{/g)].map((match) => match[1]!).sort();

describe("vite with nishiki's own stylesheets", () => {
  type Manifest = Record<string, { file: string; css?: string[] }>;
  const build = () => bundle("vite", { extract: true, conditions }, { routes: true });

  it("gives each entry and lazy page one sheet with only the rules it adds", async () => {
    const { files } = await build();
    const manifest: Manifest = JSON.parse(files[".vite/manifest.json"]!);
    const sheetOf = (key: string) => {
      expect(manifest[key]!.css, key).toHaveLength(1);
      return manifest[key]!.css![0]!;
    };
    expect(classes(files[sheetOf("index.html")]!)).toEqual(shell.sort());
    expect(classes(files[sheetOf("about.js")]!)).toEqual([...cardOf(ranked), ...about].sort());
    expect(classes(files[sheetOf("blog.js")]!)).toEqual([...cardOf(ranked), ...blog].sort());
    expect(classes(files[sheetOf("post.js")]!)).toEqual(post);

    expect([...files["index.html"]!.matchAll(/<link rel="stylesheet"[^>]*href="\/([^"]+)"/g)].map((m) => m[1])).toEqual(
      [sheetOf("index.html")],
    );
    const mapDeps = (key: string) => /const __vite__mapDeps=.*\n/.exec(files[manifest[key]!.file]!)![0];
    expect(mapDeps("index.html")).toContain(JSON.stringify(sheetOf("about.js")));
    expect(mapDeps("index.html")).toContain(JSON.stringify(sheetOf("blog.js")));
    expect(mapDeps("blog.js")).toContain(JSON.stringify(sheetOf("post.js")));
    // Only the entry's sheet loads first, so only it declares the layers, every layer any sheet uses.
    const entry = files[sheetOf("index.html")]!;
    expect(entry).toMatch(/^@layer nishiki\{@layer n0(,n[0-9a-z]+)*;\}\n/);
    for (const name of ["about.js", "blog.js", "post.js"])
      expect(files[sheetOf(name)]!, name).not.toMatch(/^@layer nishiki\{@layer /);
    const lazy = ["about.js", "blog.js", "post.js"].map((name) => files[sheetOf(name)]!).join("\n");
    expectRanked(entry + lazy);
    expect(declaredLayers(entry)).toEqual(declaredLayers(entry + lazy));
  });

  it("ranks overlapping media queries by width, so the wider wins wherever its rule lands", async () => {
    const { files } = await build();
    const manifest: Manifest = JSON.parse(files[".vite/manifest.json"]!);
    const css = files[manifest["about.js"]!.css![0]!]!;
    const [narrow, wide] = breakpointsOf(ranked).map(([, className]) => rankOfLayer(layerOf(css, className)));
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

describe.each(["rollup", "rolldown"] as const)("%s with nishiki's own stylesheets", (bundler) => {
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
    expect(files[sheetOf(files, "main")]!).toMatch(/^@layer nishiki\{@layer n0(,n[0-9a-z]+)*;\}\n/);
    for (const name of ["about", "blog", "post"]) {
      expect(files[sheetOf(files, name)]!, name).not.toMatch(/^@layer nishiki\{@layer /);
    }
  });

  it("makes each chunk wait for its sheet, and a dynamic import start loading it", async () => {
    const { files } = await build();
    const code = (name: string) => normalise(files[chunkOf(files, name).file]!);
    for (const name of ["main", "about", "blog", "post"]) {
      expect(code(name), name).toContain(normalise(`await __nishiki$css${args(sheetOf(files, name))};`));
    }
    expect(code("card")).not.toContain("__nishiki$css(");
    const imports = (name: string) =>
      normalise(`(__nishiki$css${args(sheetOf(files, name))},import("./${chunkOf(files, name).file}"))`);
    expect(code("main")).toContain(imports("about"));
    expect(code("main")).toContain(imports("blog"));
    expect(code("blog")).toContain(imports("post"));
  });

  it("declares the loader once in each chunk that loads a sheet, since none of them imports another", async () => {
    const { files } = await build();
    const declarations = (name: string) => files[chunkOf(files, name).file]!.match(/function __nishiki\$css\(/g) ?? [];
    for (const name of ["main", "about", "blog", "post"]) expect(declarations(name), name).toHaveLength(1);
    expect(declarations("card")).toEqual([]);
  });

  it("ranks overlapping media queries by width, so the wider wins wherever its rule lands", async () => {
    const { files } = await build({ extract: true, conditions });
    const css = files[sheetOf(files, "about")]!;
    const [narrow, wide] = breakpointsOf(ranked).map(([, className]) => rankOfLayer(layerOf(css, className)));
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
    expect(js.match(/await __nishiki\$css\(/g)).toHaveLength(1);
    expect(js.match(/__nishiki\$css\(/g)).toHaveLength(2);
  });

  it("gives an output that cannot wait for a sheet one per entry, for the page to link", async () => {
    const { files, js, warnings } = await build({ extract: true }, "cjs");
    const sheets = Object.keys(files).filter((name) => name.endsWith(".css"));
    expect(sheets).toEqual([sheetOf(files, "main")]);
    expect(classes(files[sheets[0]!]!)).toEqual([...shell, ...card, ...about, ...blog, ...post].sort());
    expect(js).not.toContain("__nishiki$css");
    expect(warnings!.filter((warning) => !warning.includes("conditions.order"))).toEqual([
      expect.stringContaining("this cjs output gets one stylesheet per entry"),
    ]);
  });
});

describe.each([
  { name: "webpack", bundler: "webpack" },
  { name: "rspack", bundler: "rspack" },
  { name: "rsbuild", bundler: "rsbuild" },
  // Rsbuild's production default, which transforms the placeholders before nishiki adds its rules.
  { name: "rsbuild with Lightning CSS", bundler: "rsbuild", lightningcss: true },
] as const)("$name with nishiki's own stylesheets", ({ bundler, ...config }) => {
  const build = (options: Parameters<typeof bundle>[1] = { extract: true }, splitChunks?: object) =>
    bundle(bundler, options, { ...config, routes: true, splitChunks });
  // The stylesheet the CSS pipeline emitted for a named chunk, which nishiki adds the chunk's rules to.
  const sheetOf = ({ files }: Bundle, name: string) => {
    const file = Object.keys(files).find((file) => new RegExp(`(^|/)${name}\\.[0-9a-f]+\\.css$`).test(file));
    expect(file, name).toBeDefined();
    return files[file!]!;
  };
  // Every rule in a stylesheet, by class, once for each time it appears.
  const rulesIn = (css: string) =>
    [...css.matchAll(/(?<!nishiki)\.(n[0-9a-z]+)(?![0-9a-z])/g)].map((match) => match[1]!);
  const referencedBy = (js: string) => [...normalise(js).matchAll(/"(n[0-9a-z]+)",\[\]\]/g)].map((match) => match[1]!);

  // Walks every chain of dynamic imports from each entry, as the bundler's runtime loads them: a group loads its files
  // that are not loaded yet. Every class the loaded JS references must be in a loaded stylesheet, and only once.
  function loadPaths({ files, groups = [] }: Bundle) {
    const problems: string[] = [];
    const visit = (index: number, loaded: readonly string[], path: string) => {
      const group = groups[index]!;
      const now = [...loaded, ...group.files.filter((file) => !loaded.includes(file))];
      const rules = now.filter((file) => file.endsWith(".css")).flatMap((file) => rulesIn(files[file]!));
      const repeated = rules.filter((rule, at) => rules.indexOf(rule) !== at);
      if (repeated.length > 0) problems.push(`${path} loads ${repeated.join(" ")} again`);
      const held = new Set(rules);
      const missing = now.filter((file) => file.endsWith(".js")).flatMap((file) => referencedBy(files[file]!));
      for (const rule of missing) if (!held.has(rule)) problems.push(`${path} lacks ${rule}`);
      for (const child of group.children) visit(child, now, `${path} > ${groups[child]!.name}`);
    };
    groups.forEach((group, index) => group.initial && visit(index, [], group.name ?? String(index)));
    return problems;
  }

  it("gives each entry and lazy page one sheet with only the rules it adds", async () => {
    const built = await build();
    expect(classes(sheetOf(built, "main"))).toEqual([...shell].sort());
    expect(classes(sheetOf(built, "about"))).toEqual([...card, ...about].sort());
    expect(classes(sheetOf(built, "blog"))).toEqual([...card, ...blog].sort());
    expect(classes(sheetOf(built, "post"))).toEqual(post);
    // The entry's stylesheet loads first, so it declares every layer any stylesheet uses; the lazy pages' load after it.
    const statementOf = (css: string) => /^@layer nishiki\{@layer [^{;]+;\}\n/.exec(css.trimStart())?.[0];
    const sheets = Object.entries(built.files).filter(([name]) => name.endsWith(".css"));
    expect(declaredLayers(statementOf(sheetOf(built, "main"))!)).toEqual(
      declaredLayers(sheets.map(([, css]) => css).join("\n")),
    );
    for (const name of ["about", "blog", "post"]) expect(statementOf(sheetOf(built, name)), name).toBeUndefined();
  });

  it.each([
    ["the default chunks", undefined],
    ["shared chunks split out", { chunks: "all", minSize: 0, minChunks: 1 }],
  ])(
    "loads every rule the JS references, once, along every chain of dynamic imports with %s",
    async (_, splitChunks) => {
      const built = await build({ extract: true }, splitChunks);
      expect(built.groups!.length).toBeGreaterThan(3);
      expect(loadPaths(built)).toEqual([]);
    },
  );

  it("drops a stylesheet left empty that only an entrypoint links", async () => {
    // A chunk for each module's CSS, as Next.js's CSS chunking makes: the entry's sheet goes in one of them.
    const splitChunks = {
      cacheGroups: {
        css: {
          type: "css/mini-extract",
          chunks: "all",
          enforce: true,
          name: (module: { nameForCondition(): string }) =>
            module
              .nameForCondition()
              .split(/[\\/%]/)
              .pop(),
        },
      },
    };
    const built = await bundle(bundler, { extract: true }, { ...config, splitChunks });
    const [entry] = built.groups!.filter((group) => group.initial);
    expect(Object.keys(built.files).filter((file) => file.endsWith(".css"))).toHaveLength(1);
    expect(entry!.files.filter((file) => file.endsWith(".css"))).toHaveLength(1);
    expect(loadPaths(built)).toEqual([]);
  });

  it("leaves a real .nishiki.css file to the CSS pipeline", async () => {
    const { css } = await bundle(bundler, { extract: true }, { ...config, fixture: "theme" });
    expect(css).toContain(".theme");
    expect(css).toContain(compileEntry("color", "olive")[0]![1]);
  });

  it("leaves none of the placeholders that nishiki's CSS modules hold", async () => {
    const { css } = await build();
    expect(css).not.toContain("nishiki:");
  });

  it("keeps rules of one layer in source order, which decides between overlapping media queries", async () => {
    const css = sheetOf(await build(), "about");
    const [narrow, wide] = breakpointsOf().map(([, className]) => css.indexOf(`.${className}{`));
    expect(narrow).toBeGreaterThan(0);
    expect(wide).toBeGreaterThan(narrow!);
  });

  it("builds byte-identical output twice", async () => {
    expect((await build()).files).toEqual((await build()).files);
  });

  it('puts every rule the entry reaches in its sheet with split: "single"', async () => {
    const built = await build({ extract: { split: "single" } });
    expect(classes(sheetOf(built, "main"))).toEqual([...shell, ...card, ...about, ...blog, ...post].sort());
    for (const name of ["about", "blog", "post"]) expect(classes(sheetOf(built, name)), name).toEqual([]);
    expect(loadPaths(built)).toEqual([]);
  });

  it.runIf(bundler === "webpack")("adds each rule once when CSS is evaluated in a child compiler", async () => {
    const built = await bundle(bundler, { extract: true }, { routes: true, importModule: false });
    expect(classes(sheetOf(built, "main"))).toEqual([...shell].sort());
    expect(loadPaths(built)).toEqual([]);
  });
});

describe("rsbuild with a web-worker target", () => {
  it("builds a server environment, whose CSS no browser loads", async () => {
    const built = await bundle("rsbuild", { extract: true }, { routes: true, target: "webworker" });
    expect(built.js).not.toContain("nishiki:");
  });
});

// The stylesheet of a named chunk, named after its content or not.
const sheet = ({ files }: Bundle, name: string) =>
  Object.entries(files).find(([file]) => new RegExp(`(^|/)${name}(\\.[0-9a-f]+)?\\.css$`).test(file))?.[1] ?? "";

describe.each(["webpack", "rspack"] as const)(
  "%s builds whose stylesheets nishiki leaves to the CSS pipeline",
  (bundler) => {
    // A CSS module per source module repeats the shell's `display: flex` in the about page's stylesheet.
    const perModule = (built: Bundle) =>
      classes(sheet(built, "main")).filter((rule) => classes(sheet(built, "about")).includes(rule));

    it.each([
      ["a development build", { mode: "development" }],
      ["a server build", { target: "node" }],
    ] as const)("keeps a CSS module per source module in %s", async (_, config) => {
      const built = await bundle(bundler, { extract: true }, { routes: true, ...config });
      expect(perModule(built)).not.toEqual([]);
      expect(buildWarnings(built)).toEqual([]);
    });

    it("keeps a CSS module per source module, and says why, without optimization.realContentHash", async () => {
      const built = await bundle(bundler, { extract: true }, { routes: true, realContentHash: false });
      expect(perModule(built)).not.toEqual([]);
      expect(buildWarnings(built)).toEqual([expect.stringContaining("optimization.realContentHash")]);
    });

    it.each(["[name].css", "[name].[chunkhash].css"])(
      "keeps each module's rules in its chunk's stylesheet, and says why, with stylesheets named %s",
      async (cssFilename) => {
        const built = await bundle(bundler, { extract: true }, { routes: true, cssFilename });
        expect(perModule(built)).not.toEqual([]);
        expect(built.css).not.toContain("nishiki:");
        expect(buildWarnings(built)).toEqual([expect.stringContaining("[contenthash]")]);
      },
    );

    it.each([
      ["keeps only the exports of CSS", { css: "locals" }],
      ["emits no stylesheet, as native CSS does without a document", { nativeCSS: "rule" }],
    ] as const)("builds a server build with a web target whose CSS pipeline %s", async (_, config) => {
      const built = await bundle(bundler, { extract: true }, { routes: true, target: "webworker", ...config });
      expect(built.js).not.toContain("nishiki:");
      expect(built.css).toBe("");
      expect(buildWarnings(built)).toEqual([]);
    });

    it("keeps each module's rules in JavaScript when the CSS pipeline emits no stylesheets, as with style-loader", async () => {
      const built = await bundle(bundler, { extract: true }, { routes: true, css: "script" });
      expect(built.js).not.toContain("nishiki:");
      expect(built.js).toMatch(/@layer nishiki\{@layer n0[,;]/);
      expect(buildWarnings(built)).toEqual([]);
    });

    it("fails a build whose pipeline emits stylesheets but keeps nishiki's CSS in JavaScript without its comments", async () => {
      await expect(bundle(bundler, { extract: true }, { routes: true, css: "inline" })).rejects.toThrow(
        /turned .*\.nishiki\.css into JavaScript/,
      );
    });

    it("sends only nishiki's CSS modules through a rule of its own, and a real .nishiki.css file to the CSS pipeline", async () => {
      const { css, js } = await bundle(bundler, { extract: true }, { fixture: "real-css", css: "inline" });
      expect(css).toContain(".theme");
      expect(js).not.toContain(".theme");
    });

    it.runIf(bundler === "webpack").each([
      [false, "plans"],
      [true, "leaves"],
    ])("with Next.js's withNishiki and isServer %s, %s the stylesheets", async (isServer) => {
      const built = await bundle(bundler, { extract: true }, { routes: true, next: { isServer } });
      expect(perModule(built).length > 0).toBe(isServer);
      expect(buildWarnings(built)).toEqual([]);
    });
  },
);

describe.each(["webpack", "rspack"] as const)(
  "%s with nishiki's own stylesheets for several entrypoints",
  (bundler) => {
    it.each(["chunks", "single"] as const)(
      "gives each entrypoint its rules, by %s, when entrypoints with alike CSS share a stylesheet",
      async (split) => {
        const built = await bundle(
          bundler,
          { extract: { split } },
          { fixture: "twins", splitChunks: false, cssFilename: "[contenthash].css" },
        );
        const entries = built.groups!.filter((group) => group.initial);
        const sheetsOf = (group: Group) => group.files.filter((file) => file.endsWith(".css"));
        // webpack gives both the name of their alike CSS, which Rspack's hash tells apart.
        if (bundler === "webpack") expect(new Set(entries.flatMap(sheetsOf)).size).toBe(1);
        const ruleOf = (color: string) =>
          /^@layer nishiki\.n\d+\{(.*)\}$/.exec(compileEntry("color", color)[0]![2][0]![1])![1]!;
        for (const [name, page] of [
          ["a", "navy"],
          ["b", "maroon"],
        ]) {
          const group = entries.find((entry) => entry.name === name)!;
          const css = sheetsOf(group)
            .map((file) => built.files[file])
            .join("\n");
          expect(css, name).toContain(ruleOf("teal"));
          if (split === "single") expect(css, name).toContain(ruleOf(page!));
        }
        expect(buildWarnings(built)).toEqual([]);
      },
    );

    it("keeps the order rules run in when entrypoints that reach different rules share a stylesheet", async () => {
      const built = await bundle(
        bundler,
        { extract: { split: "single" } },
        { fixture: "twins", splitChunks: false, cssFilename: "[contenthash].css" },
      );
      const sheets = built
        .groups!.filter((group) => group.initial)
        .flatMap((group) => group.files.filter((file) => file.endsWith(".css")))
        .map((file) => built.files[file]!);
      const both = sheets.filter((css) => breakpointsOf().every(([, className]) => css.includes(`.${className}{`)));
      expect(both).not.toEqual([]);
      for (const css of both) {
        const [narrow, wide] = breakpointsOf().map(([, className]) => css.indexOf(`.${className}{`));
        expect(wide).toBeGreaterThan(narrow!);
      }
    });

    it("keeps the order modules run in when a cache group puts them in a chunk that entrypoints share", async () => {
      const splitChunks = {
        cacheGroups: { styles: { name: "styles", test: /(narrow|wide)\.js/, chunks: "all", enforce: true } },
      };
      const css = sheet(await bundle(bundler, { extract: true }, { fixture: "order", splitChunks }), "styles");
      const [narrow, wide] = breakpointsOf().map(([, className]) => css.indexOf(`.${className}{`));
      expect(narrow).toBeGreaterThan(0);
      expect(wide).toBeGreaterThan(narrow!);
    });

    it('splits by chunk, and says why, when an entrypoint has no stylesheet for split: "single"', async () => {
      const built = await bundle(bundler, { extract: { split: "single" } }, { fixture: "lazy-only" });
      const text = compileEntry("color", "plum")[0]![2][0]![1];
      expect(built.css).toContain(/^@layer nishiki\.n\d+\{(.*)\}$/.exec(text)![1]);
      expect(buildWarnings(built)).toEqual([expect.stringContaining('split: "single"')]);
    });
  },
);

describe("rollup with an ES and a CommonJS output rendered together", () => {
  it("plans and emits each output's sheets on its own", async () => {
    const { rollup } = await import("rollup");
    const { default: nishiki } = await import("../../src/unplugin/rollup.ts");
    const build = await rollup({
      input: fileURLToPath(new URL("fixtures/routes/main.js", import.meta.url)),
      external: /^@nishikijs\/react(\/|$)/,
      plugins: [nishiki({ extract: true })],
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
    expect(js(es.output)).toContain("await __nishiki$css(");
    expect(js(cjs.output)).not.toContain("__nishiki$css");
  });
});

describe.each(BUNDLERS)("%s with conditions", (bundler) => {
  it("configures the runtime with the plugin's conditions and the number of ranks they make", async () => {
    const { js } = await bundle(bundler, { conditions });
    const call = `${JSON.stringify(conditions)},${ranked.table.size})`;
    // webpack and Rspack call an imported function as `(0, module.__c)(…)`.
    expect(normalise(js)).toMatch(new RegExp(RegExp.escape(`__c)(${call}`) + "|" + RegExp.escape(`__c(${call}`)));
  });
});
