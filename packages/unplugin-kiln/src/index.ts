import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createUnplugin, type UnpluginInstance } from "unplugin";

import { CSS_SUFFIX, transform, type TransformOptions } from "./transform.ts";

export type Options = TransformOptions;

const SOURCE = /\.[cm]?[jt]sx?(?:$|\?)/;
const CSS_ID = /\.kiln\.css$/;
const SELF = fileURLToPath(import.meta.url);

export const unplugin: UnpluginInstance<Options | undefined, false> = createUnplugin((options = {}) => {
  const cssModules = new Map<string, string>();
  let invalidate: ((id: string) => void) | undefined;

  return {
    name: "kiln",
    enforce: "pre",
    transform: {
      filter: { id: { include: SOURCE, exclude: /\/node_modules\// } },
      handler(code, id) {
        // webpack tracks loaders as cache dependencies, but kiln's transform runs inside unplugin's generic loader.
        const native = this.getNativeBuildContext?.();
        if (native?.framework === "webpack" || native?.framework === "rspack") {
          native.loaderContext?.addBuildDependency(SELF);
        }
        const result = transform(code, id, options);
        if (!result) return;
        if (result.css && cssModules.get(result.css.id) !== result.css.code) {
          cssModules.set(result.css.id, result.css.code);
          invalidate?.(result.css.id);
        }
        return { code: result.code, map: result.map };
      },
    },
    resolveId: {
      filter: { id: CSS_ID },
      handler(id, importer) {
        if (id.startsWith(".") && importer) return path.resolve(path.dirname(importer.replace(/[?#].*$/, "")), id);
        return path.isAbsolute(id) && existsSync(id.slice(0, -CSS_SUFFIX.length)) ? id : null;
      },
    },
    load: {
      filter: { id: CSS_ID },
      async handler(id) {
        const cached = cssModules.get(id);
        if (cached !== undefined) return cached;
        // Another process or a cache restore may have produced the importing module, so derive the rules from its source.
        const source = id.slice(0, -CSS_SUFFIX.length);
        this.addWatchFile(source);
        const css = transform(await readFile(source, "utf8"), source, options)?.css?.code ?? "";
        cssModules.set(id, css);
        return css;
      },
    },
    webpack(compiler) {
      // A persistent cache would otherwise replay modules transformed with other options, e.g. without `extract`.
      const cache = compiler.options.cache;
      if (cache && typeof cache === "object" && cache.type === "filesystem") {
        cache.version = [cache.version, "kiln:" + JSON.stringify(options)].filter(Boolean).join("|");
      }
    },
    vite: {
      configureServer(server) {
        invalidate = (id) => {
          const module = server.moduleGraph.getModuleById(id);
          if (module) void server.reloadModule(module);
        };
      },
    },
  };
});

export default unplugin;
export const vite: UnpluginInstance<Options | undefined, false>["vite"] = unplugin.vite;
export const rolldown: UnpluginInstance<Options | undefined, false>["rolldown"] = unplugin.rolldown;
export const rollup: UnpluginInstance<Options | undefined, false>["rollup"] = unplugin.rollup;
export const webpack: UnpluginInstance<Options | undefined, false>["webpack"] = unplugin.webpack;
export const rspack: UnpluginInstance<Options | undefined, false>["rspack"] = unplugin.rspack;
export const esbuild: UnpluginInstance<Options | undefined, false>["esbuild"] = unplugin.esbuild;
export const bun: UnpluginInstance<Options | undefined, false>["bun"] = unplugin.bun;
export const farm: UnpluginInstance<Options | undefined, false>["farm"] = unplugin.farm;
export { transform, type TransformOptions, type TransformResult } from "./transform.ts";

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;
  const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { default: webpackCompiler } = await import("webpack");

  describe("extracted CSS modules", () => {
    it("are rebuilt from their source in a process that never transformed it", async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "kiln-css-"));
      const source = path.join(dir, "page.tsx");
      await writeFile(source, `export const Page = () => <main css={{ color: "red" }} />;\n`);

      const imported = transform(await readFile(source, "utf8"), source, { extract: true })!;
      expect(imported.code).toContain(`import "./page.tsx${CSS_SUFFIX}";`);

      const { resolveId, load } = unplugin.raw({ extract: true }, { framework: "rollup", versions: {} });
      if (typeof resolveId !== "object" || typeof load !== "object") throw new Error("expected object hooks");
      const watched: string[] = [];
      const context = { addWatchFile: (file: string) => watched.push(file) };

      try {
        const id = await Reflect.apply(resolveId.handler, context, [`./page.tsx${CSS_SUFFIX}`, source, {}]);
        expect(id).toBe(imported.css!.id);
        expect(await Reflect.apply(load.handler, context, [id])).toBe(imported.css!.code);
        expect(watched).toEqual([source]);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe("webpack", () => {
    it("does not replay modules cached with other options", async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "kiln-webpack-"));
      await writeFile(
        path.join(dir, "entry.js"),
        `import { css } from "kiln";\nexport const styles = css({ color: "red" });\n`,
      );

      const build = (extract: boolean) =>
        new Promise<string>((done, fail) => {
          const compiler = webpackCompiler({
            mode: "development",
            context: dir,
            entry: "./entry.js",
            output: { path: path.join(dir, "dist"), library: { type: "commonjs" } },
            cache: { type: "filesystem", cacheDirectory: path.join(dir, "cache") },
            externals: ({ request }, callback) =>
              request === "kiln" || request?.endsWith(".css") ? callback(undefined, "commonjs " + request) : callback(),
            plugins: [unplugin.webpack({ extract })],
          });
          compiler.run((error, stats) => {
            compiler.close(() => {
              if (error || stats?.hasErrors()) fail(error ?? new Error(stats?.toString()));
              else done(readFile(path.join(dir, "dist", "main.js"), "utf8"));
            });
          });
        });

      try {
        expect(await build(false)).toContain("color:red");
        expect(await build(true)).not.toContain("color:red");
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it("makes kiln's own code a build dependency, so upgrading it invalidates the cache", async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "kiln-webpack-"));
      await writeFile(
        path.join(dir, "entry.js"),
        `import { css } from "kiln";\nexport const styles = css({ color: "red" });\n`,
      );
      const compiler = webpackCompiler({
        mode: "development",
        context: dir,
        entry: "./entry.js",
        output: { path: path.join(dir, "dist") },
        externals: { kiln: "commonjs kiln" },
        plugins: [unplugin.webpack()],
      });

      try {
        const dependencies = await new Promise<Set<string>>((done, fail) => {
          compiler.run((error, stats) => {
            compiler.close(() => (error || !stats ? fail(error) : done(new Set(stats.compilation.buildDependencies))));
          });
        });
        expect(dependencies).toContain(SELF);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
}
