import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import type { Options } from "../../src/index.ts";
import { splitter } from "./split.ts";

export const BUNDLERS = ["vite", "rollup", "rolldown", "esbuild", "webpack", "rspack", "rsbuild"] as const;
export type Bundler = (typeof BUNDLERS)[number];

export interface Bundle {
  js: string;
  css: string;
  /** Every emitted file by its name relative to the output directory, CSS assets included one by one. */
  files: Record<string, string>;
}

const APP = fileURLToPath(new URL("../fixtures/app/main.js", import.meta.url));
const SPLIT = fileURLToPath(new URL("../fixtures/split/main.js", import.meta.url));
const HTML = fileURLToPath(new URL("../fixtures/html/index.html", import.meta.url));
const SPLIT_LOADER = fileURLToPath(new URL("./split.ts", import.meta.url));
const EXTERNAL = /^(kiln|react)(\/|$)/;
const require = createRequire(import.meta.url);

export interface BundleOptions {
  /**
   * For webpack and Rspack: load CSS with their native CSS support instead of css-loader,
   * either through an explicit `type: "css/auto"` rule or webpack's default rules.
   */
  nativeCSS?: "rule" | "default";
  /** For Rsbuild: run its default Lightning CSS transform, which rewrites and merges the extracted rules. */
  lightningcss?: boolean;
  /**
   * Build the `split` fixture behind a code splitter that runs before kiln and turns part of a module into
   * a `?split=component` variant loaded with `import()`. Vite, Rollup, Rolldown, webpack and Rspack only.
   */
  split?: boolean;
  /** For Vite: minify CSS with its default minifier, Lightning CSS. */
  cssMinify?: boolean;
  /** For Vite: build the `html` fixture, whose styles are in an inline module script. */
  html?: boolean;
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
  const files = Object.fromEntries(
    output.map((file) => [
      file.fileName,
      file.type === "chunk"
        ? file.code
        : typeof file.source === "string"
          ? file.source
          : new TextDecoder().decode(file.source),
    ]),
  );
  return fromFiles(files);
}

function fromFiles(files: Record<string, string>): Bundle {
  const join = (extension: string) =>
    Object.entries(files)
      .filter(([name]) => name.endsWith(extension))
      .map(([, text]) => text)
      .join("\n");
  return { js: join(".js"), css: join(".css"), files };
}

async function fromDirectory(run: (dir: string) => Promise<void>): Promise<Bundle> {
  const dir = await mkdtemp(join(tmpdir(), "kiln-bundle-"));
  try {
    await run(dir);
    const names = (await readdir(dir, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => relative(dir, join(entry.parentPath, entry.name)));
    return fromFiles(
      Object.fromEntries(await Promise.all(names.map(async (name) => [name, await readFile(join(dir, name), "utf8")]))),
    );
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
export async function bundle(
  bundler: Bundler,
  options: Options,
  { nativeCSS, lightningcss = false, split = false, cssMinify = false, html = false }: BundleOptions = {},
): Promise<Bundle> {
  const ENTRY = split ? SPLIT : html ? HTML : APP;
  const before = split ? [splitter()] : [];
  const splitRules = split ? [{ test: /route\.js$/, enforce: "pre" as const, loader: SPLIT_LOADER }] : [];
  if (split && (bundler === "esbuild" || bundler === "rsbuild")) throw new Error(`no splitter for ${bundler}`);
  if (html && bundler !== "vite") throw new Error(`no HTML entry for ${bundler}`);
  switch (bundler) {
    case "vite": {
      const { build } = await import("vite-plus");
      const { default: kiln } = await import("../../src/vite.ts");
      const result = await build({
        configFile: false,
        logLevel: "silent",
        root: join(ENTRY, ".."),
        plugins: [...before, kiln(options)],
        build: {
          write: false,
          minify: false,
          cssMinify,
          manifest: true,
          rollupOptions: { input: ENTRY, external: EXTERNAL, preserveEntrySignatures: "strict" },
        },
      });
      const outputs = Array.isArray(result) ? result : [result];
      return fromOutput(outputs.flatMap((item: any) => item.output));
    }
    case "rollup": {
      const { rollup } = await import("rollup");
      const { default: kiln } = await import("../../src/rollup.ts");
      const build = await rollup({
        input: ENTRY,
        external: EXTERNAL,
        plugins: [...before, kiln(options), collectCSS()],
      });
      const { output } = await build.generate({ format: "esm" });
      await build.close();
      return fromOutput(output);
    }
    case "rolldown": {
      const { rolldown } = await import("rolldown");
      const { default: kiln } = await import("../../src/rolldown.ts");
      const build = await rolldown({
        input: ENTRY,
        external: EXTERNAL,
        plugins: [...before, kiln(options), collectCSS()],
      });
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
      return fromFiles(Object.fromEntries(result.outputFiles.map((file) => [relative("out", file.path), file.text])));
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
                  module: {
                    rules: [...splitRules, ...(nativeCSS === "rule" ? [{ test: /\.css$/, type: "css/auto" }] : [])],
                  },
                  plugins: [kiln(options)],
                }
              : {
                  module: {
                    rules: [
                      ...splitRules,
                      { test: /\.css$/, use: [MiniCssExtractPlugin.loader, require.resolve("css-loader")] },
                    ],
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
                ...splitRules,
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
    case "rsbuild": {
      const { createRsbuild } = await import("@rsbuild/core");
      const { default: kiln } = await import("../../src/rsbuild.ts");
      return fromDirectory(async (dir) => {
        const rsbuild = await createRsbuild({
          cwd: join(ENTRY, ".."),
          loadEnv: false,
          rsbuildConfig: {
            mode: "none",
            logLevel: "silent",
            source: { entry: { main: ENTRY } },
            output: {
              distPath: { root: dir },
              externals: { kiln: "commonjs kiln", react: "commonjs react" },
              minify: false,
            },
            tools: { htmlPlugin: false, lightningcssLoader: lightningcss },
            plugins: [kiln(options)],
          },
        });
        const { close } = await rsbuild.build();
        await close();
      });
    }
  }
}
