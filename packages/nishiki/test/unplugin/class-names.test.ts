import { compileEntry, type Entry } from "../../src/core/index.ts";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import { compileModule } from "../../src/unplugin/transform.ts";
import { bundle, type Bundle } from "./helpers/bundle.ts";

const COMPACT = { extract: { classNames: "compact" } } as const;
const ROUTES = fileURLToPath(new URL("fixtures/routes/main.js", import.meta.url));

// Every rule of the routes fixture, by the module that compiles it. `display: flex`, `margin: 0` and `gap: 4` each come
// from two modules, every other rule from one.
const modules: Record<string, Entry[]> = {
  main: [...compileEntry("display", "flex"), ...compileEntry("margin", 0)],
  card: [
    ...compileEntry("padding", 0),
    ...compileEntry("borderRadius", 4),
    ...compileEntry("@media (min-width: 600px)", { padding: 8 }),
    ...compileEntry("@media (min-width: 900px)", { padding: 16 }),
  ],
  about: [...compileEntry("display", "flex"), ...compileEntry("color", "teal")],
  blog: [...compileEntry("color", "navy"), ...compileEntry("gap", 4)],
  post: [...compileEntry("margin", 0), ...compileEntry("gap", 4), ...compileEntry("fontStyle", "italic")],
};
const rules = new Map(Object.values(modules).flatMap((entries) => entries.flatMap(([, , list]) => list)));
const shared = [modules.main![0]!, modules.main![1]!, modules.blog![1]!].map(([, className]) => className);

const scripts = ({ files }: Bundle, extension = ".js") =>
  Object.entries(files)
    .filter(([name]) => name.endsWith(extension))
    .map(([, code]) => code)
    .join("\n");
const sheets = ({ files }: Bundle) =>
  Object.entries(files)
    .filter(([name]) => name.endsWith(".css"))
    .map(([, css]) => css)
    .join("\n");

// The name each rule has in a bundle's stylesheets, found by the rest of its text.
function namesIn(css: string): Map<string, string> {
  const flat = css.replace(/\s+/g, "");
  const names = new Map<string, string>();
  for (const [className, text] of rules) {
    const body = /^@layer [^{]+\{(.*)\}$/s.exec(text)![1]!.replace(/\s+/g, "");
    const [before, ...after] = body.split("." + className);
    const pattern = RegExp.escape(before!) + "\\.([\\w-]+)" + after.map((part) => RegExp.escape(part)).join("\\.\\1");
    const found = new RegExp(pattern).exec(flat);
    expect(found, text).not.toBeNull();
    names.set(className, found![1]!);
  }
  return names;
}

describe.each(["vite", "rollup", "rolldown", "webpack", "rspack", "rsbuild"] as const)(
  'extract: { classNames: "compact" } with %s',
  (bundler) => {
    const build = (options: Parameters<typeof bundle>[1] = COMPACT) => bundle(bundler, options, { routes: true });

    it("names every rule anew, the rules most modules use first, in the scripts and stylesheets alike", async () => {
      const compact = await build();
      const names = namesIn(sheets(compact));
      const all = [...names.values()];
      expect(new Set(all).size).toBe(rules.size);
      expect(all.every((name) => /^_[0-9a-z]$/.test(name))).toBe(true);
      expect(new Set(shared.map((className) => names.get(className)))).toEqual(new Set(["_0", "_1", "_2"]));

      const js = scripts(compact);
      for (const [className, name] of names) {
        expect(js, className).not.toContain(className);
        expect(js, name).toMatch(new RegExp(`["'\` ]${name}["'\` ]`));
      }
      expect(sheets(compact)).not.toMatch(/\.n[0-9a-z]{3,}/);
    });

    it("builds byte-identical output twice", async () => {
      expect((await build()).files).toEqual((await build()).files);
    });

    it("leaves the hashed names of a build without it", async () => {
      const hashed = await build({ extract: true });
      const names = namesIn(sheets(hashed));
      expect([...names]).toEqual([...names.keys()].map((className) => [className, className]));
    });
  },
);

describe.each(["webpack", "rspack"] as const)('extract: { classNames: "compact" } with %s', (bundler) => {
  it("renames the rules in scripts whose names do not end in .js", async () => {
    const compact = await bundle(bundler, COMPACT, { routes: true, jsFilename: "[name].bundle" });
    const js = scripts(compact, ".bundle");
    expect(js).not.toBe("");
    for (const [className, name] of namesIn(sheets(compact))) {
      expect(js, className).not.toContain(className);
      expect(js, name).toMatch(new RegExp(`["'\` ]${name}["'\` ]`));
    }
  });
});

describe('extract: { classNames: "compact" }', () => {
  it("leaves the transform's output, which bundlers cache, as it is without it", () => {
    const source = `import { css } from "@nishikijs/react";\nexport const a = css({ color: "red" }), b = <p css={{ gap: 4 }} />;\n`;
    const module = { cssImport: false, configImport: true, lean: true };
    expect(compileModule(source, "/src/a.jsx", COMPACT, module)).toEqual(
      compileModule(source, "/src/a.jsx", { extract: true }, module),
    );
  });

  it("fails a server build in the same process, which would render names the client's stylesheets lack", async () => {
    const { build } = await import("vite-plus");
    const { default: nishiki } = await import("../../src/unplugin/vite.ts");
    await expect(
      build({
        configFile: false,
        logLevel: "silent",
        plugins: [nishiki(COMPACT)],
        build: { write: false, ssr: ROUTES, rollupOptions: { external: [/^@nishikijs\/react/] } },
      }),
    ).rejects.toThrow(/names rules in the client build alone, but the ssr environment renders them too/);
    await expect(bundle("webpack", COMPACT, { routes: true, target: "node" })).rejects.toThrow(
      /names rules in the client build alone, but the server build renders them too/,
    );
  });

  it("is refused by Next.js, which renders on the server", async () => {
    const { default: withNishiki } = await import("../../src/unplugin/next.ts");
    expect(() => withNishiki({}, COMPACT)).toThrow(/Next\.js renders them on the server too/);
  });

  it("keeps hashed names in Vite's dev server", async () => {
    const { createServer } = await import("vite-plus");
    const { default: nishiki } = await import("../../src/unplugin/vite.ts");
    const server = await createServer({
      configFile: false,
      logLevel: "silent",
      root: fileURLToPath(new URL("fixtures/routes", import.meta.url)),
      plugins: [nishiki(COMPACT)],
      resolve: { conditions: ["source"] },
      server: { middlewareMode: true, hmr: false, ws: false },
    });
    try {
      expect((await server.transformRequest(ROUTES))!.code).toContain(modules.main![0]![1]);
    } finally {
      await server.close();
    }
  });
});

describe("class names that collide", () => {
  // djb2 hashes these two rules alike.
  const tall = `import { css } from "@nishikijs/react";\nexport const a = css({ height: "7044px" });\n`;
  const short = `import { css } from "@nishikijs/react";\nexport const b = css({ height: "2100.11rem" });\n`;

  it.each([{}, { extract: true }])("fail the build, naming both rules and their modules, with %o", async (options) => {
    const { unplugin } = await import("../../src/unplugin/index.ts");
    const { transform } = unplugin.raw(options, { framework: "rollup", versions: {} });
    if (typeof transform !== "object") throw new Error("expected an object hook");
    const run = (code: string, id: string) => Reflect.apply(transform.handler, { warn: () => {} }, [code, id]);
    run(tall, "/src/a.js");
    run(tall, "/src/c.js");
    expect(() => run(short, "/src/b.js")).toThrow(
      /^\[nishiki\] the rules @layer nishiki\.n0\{\.n279bed\{height:7044px\}\} and @layer nishiki\.n0\{\.n279bed\{height:2100\.11rem\}\} \(in \/src\/a\.js and \/src\/b\.js\) have the same class name, n279bed/,
    );
  });

  it("fail a module that compiles both", () => {
    const both = `import { css } from "@nishikijs/react";\nexport const a = css({ height: "7044px" }, { height: "2100.11rem" });\n`;
    expect(() => compileModule(both, "/src/a.js", {}, { cssImport: true, configImport: false, lean: false })).toThrow(
      /have the same class name, n279bed/,
    );
  });
});
