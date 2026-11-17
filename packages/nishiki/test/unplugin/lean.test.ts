import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

// Each bundler compiles the fixture's JSX with its own JSX transform after nishiki's, against `@nishikijs/react`, and
// keeps nishiki and React external, so the output names the entries the modules import.
const FIXTURES = fileURLToPath(new URL("fixtures/lean/", import.meta.url));
const SRC = fileURLToPath(new URL("../../src/unplugin/", import.meta.url));
const JSX_LOADER = fileURLToPath(new URL("helpers/jsx-loader.cjs", import.meta.url));
const EXTERNAL = /^(@nishikijs\/react|react)(\/|$)/;
const IMPORT_SOURCE = "@nishikijs/react";

const BUNDLERS = ["vite", "rolldown", "esbuild", "webpack", "rspack", "bun"] as const;
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
