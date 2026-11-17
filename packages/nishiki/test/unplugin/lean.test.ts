import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import { EXTERNAL } from "./helpers/external.ts";

// Each bundler compiles the fixture's JSX with its own JSX transform after nishiki's, against `@nishikijs/react`, and
// keeps nishiki and React external, so the output names the entries the modules import.
const FIXTURES = fileURLToPath(new URL("fixtures/lean/", import.meta.url));
const SRC = fileURLToPath(new URL("../../src/unplugin/", import.meta.url));
const PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const JSX_LOADER = fileURLToPath(new URL("helpers/jsx-loader.cjs", import.meta.url));
const IMPORT_SOURCE = "@nishikijs/react";

const BUNDLERS = ["vite", "rollup", "rolldown", "esbuild", "webpack", "rspack", "farm", "bun"] as const;
type Bundler = (typeof BUNDLERS)[number];

async function inDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "nishiki-lean-"));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function readOutput(dir: string): Promise<string> {
  const files = (await readdir(dir, { recursive: true })).filter((file) => file.endsWith(".js"));
  return (await Promise.all(files.map((file) => readFile(path.join(dir, file), "utf8")))).join("\n");
}

// Compiled with webpack and Rspack in the shape of a commonjs library, so their externals stay `require` calls.
const webpackExternals = (
  { request }: { request?: string },
  callback: (error?: Error | null, result?: string) => void,
) => (request && EXTERNAL.test(request) ? callback(null, "commonjs " + request) : callback());

const builds: Record<Bundler, (entry: string) => Promise<string>> = {
  async vite(entry) {
    const { build } = await import("vite-plus");
    const { default: nishiki } = await import("../../src/unplugin/vite.ts");
    const result = await build({
      configFile: false,
      logLevel: "silent",
      root: FIXTURES,
      plugins: [nishiki()],
      // Vitest's NODE_ENV would otherwise pick the development JSX runtime.
      oxc: { jsx: { runtime: "automatic", importSource: IMPORT_SOURCE, development: false } },
      build: {
        write: false,
        minify: false,
        rollupOptions: { input: entry, external: EXTERNAL, preserveEntrySignatures: "strict" },
      },
    });
    const outputs = (Array.isArray(result) ? result : [result]) as { output: { type: string; code?: string }[] }[];
    return outputs
      .flatMap((item) => item.output)
      .map((chunk) => chunk.code ?? "")
      .join("\n");
  },
  // Rollup has no JSX transform of its own; esbuild's, as a plugin after nishiki, stands in for an app's.
  async rollup(entry) {
    const { rollup } = await import("rollup");
    const { transform } = await import("esbuild");
    const { default: nishiki } = await import("../../src/unplugin/rollup.ts");
    const jsx = {
      name: "jsx",
      async transform(code: string, id: string) {
        if (!id.endsWith(".jsx")) return null;
        const result = await transform(code, { loader: "jsx", jsx: "automatic", jsxImportSource: IMPORT_SOURCE });
        return { code: result.code, map: null };
      },
    };
    const bundle = await rollup({ input: entry, external: EXTERNAL, plugins: [nishiki(), jsx], onwarn: () => {} });
    const { output } = await bundle.generate({ format: "es" });
    await bundle.close();
    return output.map((chunk) => (chunk.type === "chunk" ? chunk.code : "")).join("\n");
  },
  async rolldown(entry) {
    const { rolldown } = await import("rolldown");
    const { default: nishiki } = await import("../../src/unplugin/rolldown.ts");
    const bundle = await rolldown({
      input: entry,
      external: EXTERNAL,
      transform: { jsx: { runtime: "automatic", importSource: IMPORT_SOURCE } },
      plugins: [nishiki()],
      onLog: () => {},
    });
    const { output } = await bundle.generate({ format: "es" });
    await bundle.close();
    return output.map((chunk) => (chunk.type === "chunk" ? chunk.code : "")).join("\n");
  },
  async esbuild(entry) {
    const { build } = await import("esbuild");
    const { default: nishiki } = await import("../../src/unplugin/esbuild.ts");
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: "esm",
      logLevel: "silent",
      jsx: "automatic",
      jsxImportSource: IMPORT_SOURCE,
      external: ["@nishikijs/react", "@nishikijs/react/*", "react", "react/*"],
      plugins: [nishiki()],
    });
    return result.outputFiles.map((file) => file.text).join("\n");
  },
  webpack: (entry) =>
    inDir(async (dir) => {
      const { default: webpack } = await import("webpack");
      const { default: nishiki } = await import("../../src/unplugin/webpack.ts");
      const compiler = webpack({
        mode: "none",
        context: FIXTURES,
        entry,
        output: { path: dir, library: { type: "commonjs" } },
        externals: webpackExternals,
        module: { rules: [{ test: /\.jsx$/, loader: JSX_LOADER }] },
        plugins: [nishiki()],
      });
      await run(compiler);
      return readOutput(dir);
    }),
  rspack: (entry) =>
    inDir(async (dir) => {
      const { rspack } = await import("@rspack/core");
      const { default: nishiki } = await import("../../src/unplugin/rspack.ts");
      const compiler = rspack({
        mode: "none",
        context: FIXTURES,
        entry,
        output: { path: dir, library: { type: "commonjs" } },
        externals: webpackExternals,
        module: {
          rules: [
            {
              test: /\.jsx$/,
              loader: "builtin:swc-loader",
              options: {
                jsc: {
                  parser: { syntax: "ecmascript", jsx: true },
                  transform: { react: { runtime: "automatic", importSource: IMPORT_SOURCE } },
                },
              },
            },
          ],
        },
        plugins: [nishiki()],
      });
      await run(compiler);
      return readOutput(dir);
    }),
  // Farm's React plugin ignores the `@jsxImportSource` pragma, so its JSX runtime imports reach nishiki's resolver. Farm
  // bundles what a plugin resolves, externals or not, so each of nishiki's entries, whichever file or name it resolves
  // to, loads as a stub that records it.
  async farm(entry) {
    const { createCompiler, Logger, resolveConfig } = await import("@farmfe/core");
    const { default: nishiki } = await import("../../src/unplugin/farm.ts");
    const loaded = new Set<string>();
    // Resolves what neither nishiki nor Farm resolved to a file named after it, and loads every entry before Farm's own
    // loaders.
    const resolveStub = {
      name: "nishiki-entry-names",
      priority: 0,
      resolve: {
        filters: { sources: ["^@nishikijs/react(/.*)?$"], importers: [".*"] },
        async executor({ source }: { source: string }) {
          const resolvedPath = path.join(PACKAGE_ROOT, "src", (source.slice(IMPORT_SOURCE.length) || "/index") + ".ts");
          return { resolvedPath, external: false, sideEffects: true, query: [], meta: {} };
        },
      },
    };
    const loadStub = {
      name: "nishiki-entries",
      priority: 1000,
      load: {
        // Farm matches these in Rust, which reads none of the `\x` escapes RegExp.escape writes.
        filters: { resolvedPaths: ["^" + PACKAGE_ROOT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:src|dist)/"] },
        async executor({ resolvedPath }: { resolvedPath: string }) {
          const subpath = path
            .relative(PACKAGE_ROOT, resolvedPath)
            .replace(/^(?:src|dist)[\\/]|(?:[\\/]?index)?\.[jt]sx?$/g, "");
          loaded.add(IMPORT_SOURCE + (subpath && "/" + subpath));
          return { content: `export const css = 0, jsx = 0, jsxs = 0, Fragment = 0, __k = 0;`, moduleType: "js" };
        },
      },
    };
    const logger = new Logger();
    const config = await resolveConfig(
      {
        // unplugin resolves the importers Farm passes, which are relative to the root, against the cwd.
        root: process.cwd(),
        compilation: {
          input: { main: entry },
          output: { targetEnv: "library-browser", format: "esm" },
          minify: false,
          persistentCache: false,
        },
        plugins: [
          // Farm resolves a Rust plugin from its root, not from this package.
          [
            createRequire(import.meta.url).resolve("@farmfe/plugin-react"),
            { runtime: "automatic", importSource: IMPORT_SOURCE },
          ],
          nishiki(),
          resolveStub,
          loadStub,
        ],
      },
      "production",
      logger,
      false,
    );
    await (await createCompiler(config, logger)).compile();
    return [...loaded].map((id) => `import ${JSON.stringify(id)};`).join("\n");
  },
  // Bun.build needs Bun, so it runs in a Bun process, with Bun's own JSX import source rather than nishiki's, and
  // without Vitest's NODE_ENV, which would pick the development JSX runtime.
  async bun(entry) {
    const script = `
      const { default: nishiki } = await import(${JSON.stringify(path.join(SRC, "bun.ts"))});
      const result = await Bun.build({
        entrypoints: [${JSON.stringify(entry)}],
        external: ["@nishikijs/react", "@nishikijs/react/*", "react", "react/*"],
        plugins: [nishiki()],
      });
      if (!result.success) throw new AggregateError(result.logs, "Bun.build failed");
      process.stdout.write((await Promise.all(result.outputs.map((output) => output.text()))).join("\\n"));
    `;
    return execFileSync("bun", ["-e", script], {
      cwd: FIXTURES,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "production" },
    });
  },
};

function run(compiler: any): Promise<void> {
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

// The nishiki entries an output imports or requires.
const entriesOf = (js: string) =>
  new Set(
    [...js.matchAll(/(?:from\s*|import\s*|require\()["'](@nishikijs\/react(?:\/[\w/-]+)?)["']/g)].map((m) => m[1]),
  );

describe.each(BUNDLERS)("%s", (bundler) => {
  it("loads only the lean entries for compiled modules, JSX with no styles of its own included", async () => {
    const js = await builds[bundler](path.join(FIXTURES, "main.jsx"));
    expect(entriesOf(js)).toEqual(new Set(["@nishikijs/react/lean", "@nishikijs/react/lean/jsx-runtime"]));
  });

  it("loads the compiler beside them where a module falls back to it", async () => {
    const js = await builds[bundler](path.join(FIXTURES, "loose.jsx"));
    expect(entriesOf(js)).toEqual(new Set(["@nishikijs/react/compiler", "@nishikijs/react/lean/jsx-runtime"]));
  });
});
