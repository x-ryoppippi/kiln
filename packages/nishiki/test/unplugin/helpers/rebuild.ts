import { execFile } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { NISHIKI_ENTRY } from "./external.ts";

export const CACHED_BUNDLERS = ["farm", "webpack", "rspack", "rsbuild"] as const;
export type CachedBundler = (typeof CACHED_BUNDLERS)[number];

const SELF = fileURLToPath(import.meta.url);

/**
 * Build a module with rules twice into one fresh persistent cache, without and then with `extract`, and return the
 * JS of both builds.
 */
export async function rebuild(bundler: CachedBundler): Promise<[runtime: string, extracted: string]> {
  // unplugin stores virtual modules under the root as given, but Rspack resolves them to their real path,
  // so under a symlinked root such as macOS's /var the build cannot find nishiki's CSS module.
  const dir = await mkdtemp(path.join(await realpath(tmpdir()), "nishiki-cache-"));
  try {
    await writeFile(
      path.join(dir, "entry.js"),
      `import { css } from "@nishikijs/react";\nexport const styles = css({ color: "red" });\n`,
    );
    // Rspack cleans up its cache directory on tasks that outlive `compiler.close()`, and Farm writes a development
    // cache on a detached thread, so only the exit of the process that built is sure to leave the directory alone.
    await promisify(execFile)(process.execPath, ["--conditions=source", SELF, bundler, dir]);
    return JSON.parse(await readFile(path.join(dir, "outputs.json"), "utf8"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const builds: Record<CachedBundler, (dir: string, extract: boolean) => Promise<string>> = {
  async farm(dir, extract) {
    const { createCompiler, Logger, resolveConfig } = await import("@farmfe/core");
    const nishiki = await import("../../../src/unplugin/index.ts");
    const logger = new Logger();
    const config = await resolveConfig(
      {
        // unplugin resolves the importers Farm passes, which are relative to the root, against the cwd.
        root: process.cwd(),
        compilation: {
          input: { main: path.join(dir, "entry.js") },
          output: { targetEnv: "library-node" },
          external: [NISHIKI_ENTRY.source],
          minify: false,
          persistentCache: { cacheDir: path.join(dir, "cache") },
        },
        plugins: [nishiki.farm({ extract })],
      },
      "production",
      logger,
      false,
    );
    const compiler = await createCompiler(config, logger);
    await compiler.compile();
    return Object.entries(compiler.resources())
      .filter(([name]) => name.endsWith(".js"))
      .map(([, code]) => Buffer.from(code).toString("utf8"))
      .join("\n");
  },

  async webpack(dir, extract) {
    const { default: webpack } = await import("webpack");
    const nishiki = await import("../../../src/unplugin/index.ts");
    const compiler = webpack({
      mode: "development",
      context: dir,
      entry: "./entry.js",
      output: { path: path.join(dir, "dist"), library: { type: "commonjs" } },
      cache: { type: "filesystem", cacheDirectory: path.join(dir, "cache") },
      externals: ({ request }, callback) =>
        (request && NISHIKI_ENTRY.test(request)) || request?.endsWith(".css")
          ? callback(undefined, "commonjs " + request)
          : callback(),
      plugins: [nishiki.webpack({ extract })],
    });
    await new Promise<void>((done, fail) => {
      compiler.run((error, stats) => {
        compiler.close(() => {
          if (error || stats?.hasErrors()) fail(error ?? new Error(stats?.toString()));
          else done();
        });
      });
    });
    return readFile(path.join(dir, "dist", "main.js"), "utf8");
  },

  async rspack(dir, extract) {
    const { rspack } = await import("@rspack/core");
    const nishiki = await import("../../../src/unplugin/index.ts");
    const compiler = rspack({
      mode: "development",
      context: dir,
      entry: "./entry.js",
      output: { path: path.join(dir, "dist"), library: { type: "commonjs" } },
      cache: { type: "persistent", storage: { type: "filesystem", directory: path.join(dir, "cache") } },
      externals: ({ request }, callback) =>
        (request && NISHIKI_ENTRY.test(request)) || request?.endsWith(".css")
          ? callback(undefined, "commonjs " + request)
          : callback(),
      plugins: [nishiki.rspack({ extract })],
    });
    await new Promise<void>((done, fail) => {
      compiler.run((error, stats) => {
        compiler.close(() => {
          if (error || stats?.hasErrors()) fail(error ?? new Error(stats?.toString()));
          else done();
        });
      });
    });
    return readFile(path.join(dir, "dist", "main.js"), "utf8");
  },

  async rsbuild(dir, extract) {
    const { createRsbuild } = await import("@rsbuild/core");
    const nishiki = await import("../../../src/unplugin/index.ts");
    const rsbuild = await createRsbuild({
      cwd: dir,
      loadEnv: false,
      rsbuildConfig: {
        mode: "development",
        logLevel: "silent",
        source: { entry: { index: "./entry.js" } },
        output: { filenameHash: false, externals: [NISHIKI_ENTRY] },
        performance: { buildCache: { cacheDirectory: path.join(dir, "cache") } },
        plugins: [nishiki.rsbuild({ extract })],
      },
    });
    const { close } = await rsbuild.build();
    await close();
    return readFile(path.join(dir, "dist", "static", "js", "index.js"), "utf8");
  },
};

if (import.meta.main) {
  const [bundler, dir] = process.argv.slice(2) as [CachedBundler, string];
  const outputs = [await builds[bundler](dir, false), await builds[bundler](dir, true)];
  await writeFile(path.join(dir, "outputs.json"), JSON.stringify(outputs));
}
