import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Options } from "../../src/index.ts";

export const BUNDLERS = ["vite", "rollup", "rolldown", "esbuild", "webpack", "rspack"] as const;
export type Bundler = (typeof BUNDLERS)[number];

export interface Bundle {
  js: string;
  css: string;
}

const ENTRY = fileURLToPath(new URL("../fixtures/app/main.js", import.meta.url));
const EXTERNAL = /^(kiln|react)(\/|$)/;
const require = createRequire(import.meta.url);

export interface BundleOptions {
  /**
   * For webpack and Rspack: load CSS with their native CSS support instead of css-loader,
   * either through an explicit `type: "css/auto"` rule or webpack's default rules.
   */
  nativeCSS?: "rule" | "default";
}

/** Collects CSS the way a CSS plugin would, for bundlers that cannot load CSS themselves. */
function collectCSS() {
  return {
    name: "collect-css",
    transform(code: string, id: string) {
      if (!id.endsWith(".css")) return null;
      (this as any).emitFile({ type: "asset", fileName: id.replace(/^.*\//, ""), source: code });
      return { code: "", moduleSideEffects: true, moduleType: "js" };
    },
  };
}

function fromOutput(output: readonly any[]): Bundle {
  const js = output.filter((file) => file.type === "chunk").map((file) => file.code);
  const css = output
    .filter((file) => file.type === "asset" && file.fileName.endsWith(".css"))
    .map((file) => (typeof file.source === "string" ? file.source : new TextDecoder().decode(file.source)));
  return { js: js.join("\n"), css: css.join("\n") };
}

async function fromDirectory(run: (dir: string) => Promise<void>): Promise<Bundle> {
  const dir = await mkdtemp(join(tmpdir(), "kiln-bundle-"));
  try {
    await run(dir);
    const files = await readdir(dir, { recursive: true });
    const read = (extension: string) =>
      Promise.all(files.filter((file) => file.endsWith(extension)).map((file) => readFile(join(dir, file), "utf8")));
    return { js: (await read(".js")).join("\n"), css: (await read(".css")).join("\n") };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runCompiler(compiler: any): Promise<void> {
  return new Promise((resolve, reject) => {
    compiler.run((error: Error | null, stats: any) => {
      compiler.close(() => {
        if (error) reject(error);
        else if (stats.hasErrors()) reject(new Error(stats.toString({ all: false, errors: true })));
        else resolve();
      });
    });
  });
}

/** Build the fixture app with `bundler`, keeping `kiln` and React external, without writing next to the inputs. */
export async function bundle(bundler: Bundler, options: Options, { nativeCSS }: BundleOptions = {}): Promise<Bundle> {
  switch (bundler) {
    case "vite": {
      const { build } = await import("vite-plus");
      const { default: kiln } = await import("../../src/vite.ts");
      const result = await build({
        configFile: false,
        logLevel: "silent",
        root: fileURLToPath(new URL("../fixtures/app", import.meta.url)),
        plugins: [kiln(options)],
        build: {
          write: false,
          minify: false,
          cssMinify: false,
          rollupOptions: { input: ENTRY, external: EXTERNAL, preserveEntrySignatures: "strict" },
        },
      });
      const outputs = Array.isArray(result) ? result : [result];
      return fromOutput(outputs.flatMap((item: any) => item.output));
    }
    case "rollup": {
      const { rollup } = await import("rollup");
      const { default: kiln } = await import("../../src/rollup.ts");
      const build = await rollup({ input: ENTRY, external: EXTERNAL, plugins: [kiln(options), collectCSS()] });
      const { output } = await build.generate({ format: "esm" });
      await build.close();
      return fromOutput(output);
    }
    case "rolldown": {
      const { rolldown } = await import("rolldown");
      const { default: kiln } = await import("../../src/rolldown.ts");
      const build = await rolldown({ input: ENTRY, external: EXTERNAL, plugins: [kiln(options), collectCSS()] });
      const { output } = await build.generate({ format: "esm" });
      await build.close();
      return fromOutput(output);
    }
    case "esbuild": {
      const { build } = await import("esbuild");
      const { default: kiln } = await import("../../src/esbuild.ts");
      const result = await build({
        entryPoints: [ENTRY],
        bundle: true,
        write: false,
        format: "esm",
        outdir: "out",
        logLevel: "silent",
        external: ["kiln", "react"],
        plugins: [kiln(options)],
      });
      const text = (extension: string) =>
        result.outputFiles
          .filter((file) => file.path.endsWith(extension))
          .map((file) => file.text)
          .join("\n");
      return { js: text(".js"), css: text(".css") };
    }
    case "webpack": {
      const { default: webpack } = await import("webpack");
      const { default: MiniCssExtractPlugin } = await import("mini-css-extract-plugin");
      const { default: kiln } = await import("../../src/webpack.ts");
      return fromDirectory((dir) =>
        runCompiler(
          webpack({
            mode: "none",
            context: join(ENTRY, ".."),
            entry: ENTRY,
            output: { path: dir },
            externals: { kiln: "commonjs kiln", react: "commonjs react" },
            ...(nativeCSS
              ? {
                  experiments: { css: true },
                  module: { rules: nativeCSS === "rule" ? [{ test: /\.css$/, type: "css/auto" }] : [] },
                  plugins: [kiln(options)],
                }
              : {
                  module: {
                    rules: [{ test: /\.css$/, use: [MiniCssExtractPlugin.loader, require.resolve("css-loader")] }],
                  },
                  plugins: [kiln(options), new MiniCssExtractPlugin()],
                }),
          }),
        ),
      );
    }
    case "rspack": {
      const { rspack, CssExtractRspackPlugin } = await import("@rspack/core");
      const { default: kiln } = await import("../../src/rspack.ts");
      return fromDirectory((dir) =>
        runCompiler(
          rspack({
            mode: "none",
            context: join(ENTRY, ".."),
            entry: ENTRY,
            output: { path: dir },
            externals: { kiln: "commonjs kiln", react: "commonjs react" },
            module: {
              rules: [
                nativeCSS
                  ? { test: /\.css$/, type: "css/auto" }
                  : { test: /\.css$/, use: [CssExtractRspackPlugin.loader, require.resolve("css-loader")] },
              ],
            },
            plugins: [kiln(options), ...(nativeCSS ? [] : [new CssExtractRspackPlugin()])],
          }),
        ),
      );
    }
  }
}
