import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";

export type Sizes = { raw: number; gzip: number; brotli: number };

export type RuntimeSizes = {
  js: Sizes;
  lean: Sizes | null;
  leanExtract: Sizes | null;
  layerOrder: { raw: number; gzip: number };
};

const nishiki = path.resolve(import.meta.dirname, "../../packages/nishiki");

// nishiki's own runtime as an app ships it: the `@nishikijs/react` and `@nishikijs/react/jsx-runtime` entries bundled from source and minified
// for production, React left out, and the `@nishikijs/react/lean` entries that modules the plugin compiles import instead, with
// what compiled code uses of them, without extract and with it. Also the layer statement the runtime inserts, raw and gzipped.
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
  const leanOf = async (helpers: readonly string[]) =>
    existsSync(path.join(nishiki, "src/lean"))
      ? await sizesOf(
          `export { ${helpers.join(", ")}, css, layerOrder, styled, Styles } from "./src/lean/index.ts";\n` +
            `export { jsx, jsxs } from "./src/lean/jsx-runtime.ts";\n`,
        )
      : null;
  // The helpers compiled modules import: entries to unpack and values to format without extract; with it, entries'
  // class names, values formatted from what the build derived, class names joined to an element's and css() folded;
  // and either way, the setter of runtime values that elements take as custom properties.
  const lean = await leanOf(["__c", "__d", "__k", "__v"]);
  const leanExtract = await leanOf(["__c", "__d", "__f", "__j", "__n", "__x"]);
  const core = await import(pathToFileURL(path.join(nishiki, "src/core/index.ts")).href);
  const statement: string = "layerOrder" in core ? core.layerOrder() : core.LAYER_ORDER;
  return {
    js,
    lean,
    leanExtract,
    layerOrder: { raw: Buffer.byteLength(statement), gzip: gzipSync(statement, { level: 9 }).length },
  };
}
