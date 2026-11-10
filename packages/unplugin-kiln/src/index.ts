import { createUnplugin, type UnpluginInstance } from "unplugin";

import { transform, VIRTUAL_PREFIX, type TransformOptions } from "./transform.ts";

export type Options = TransformOptions;

const SOURCE = /\.[cm]?[jt]sx?(?:$|\?)/;
const VIRTUAL_ID = new RegExp("^" + VIRTUAL_PREFIX);

export const unplugin: UnpluginInstance<Options | undefined, false> = createUnplugin((options = {}) => {
  const cssModules = new Map<string, string>();
  let invalidate: ((id: string) => void) | undefined;

  return {
    name: "kiln",
    enforce: "pre",
    transform: {
      filter: { id: { include: SOURCE, exclude: /\/node_modules\// } },
      handler(code, id) {
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
      filter: { id: VIRTUAL_ID },
      handler(id) {
        return id;
      },
    },
    load: {
      filter: { id: VIRTUAL_ID },
      handler(id) {
        return cssModules.get(id) ?? "";
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
  const { mkdtemp, readFile, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { default: webpackCompiler } = await import("webpack");

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
  });
}
