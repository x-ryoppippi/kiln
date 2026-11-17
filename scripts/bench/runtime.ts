import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";

export type Sizes = { raw: number; gzip: number; brotli: number };

export type RuntimeSizes = { js: Sizes; lean: Sizes | null; layerOrder: { raw: number; gzip: number } };

const nishiki = path.resolve(import.meta.dirname, "../../packages/nishiki");

// nishiki's own runtime as an app ships it: the `@nishikijs/react` and `@nishikijs/react/jsx-runtime` entries bundled from source and minified
// for production, React left out, and the `@nishikijs/react/lean` entries that modules the plugin compiles import instead, with
// what compiled code uses of them. Also the layer statement the runtime inserts, raw and gzipped.
export async function measureRuntime(): Promise<RuntimeSizes> {
  // esbuild is the nishiki package's dev dependency, not the repository root's.
  const { build } = createRequire(path.join(nishiki, "package.json"))("esbuild") as {
    build: (options: object) => Promise<{ outputFiles: { contents: Uint8Array }[] }>;
  };
  const sizesOf = async (contents: string): Promise<Sizes> => {
    const result = await build({
      stdin: { contents, resolveDir: nishiki, loader: "ts" },
      bundle: true,
      write: false,
      format: "esm",
      minify: true,
      external: ["react", "react/*", "react-dom", "react-dom/*"],
      define: { "process.env.NODE_ENV": '"production"', "import.meta.vitest": "undefined" },
    });
    const code = result.outputFiles[0]!.contents;
    return { raw: code.length, gzip: gzipSync(code, { level: 9 }).length, brotli: brotliCompressSync(code).length };
  };
  const js = await sizesOf(`export * from "./src/index.ts";\nexport { jsx, jsxs } from "./src/jsx-runtime.ts";\n`);
  const lean = existsSync(path.join(nishiki, "src/lean"))
    ? await sizesOf(
        `export { __c, __j, __k, __n, __v, __x, css, layerOrder, styled, Styles } from "./src/lean/index.ts";\n` +
          `export { jsx, jsxs } from "./src/lean/jsx-runtime.ts";\n`,
      )
    : null;
  const core = await import(pathToFileURL(path.join(nishiki, "src/core/index.ts")).href);
  const statement: string = "layerOrder" in core ? core.layerOrder() : core.LAYER_ORDER;
  return {
    js,
    lean,
    layerOrder: { raw: Buffer.byteLength(statement), gzip: gzipSync(statement, { level: 9 }).length },
  };
}
