import { execFile } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { createUnplugin } from "unplugin";

import { NISHIKI_ENTRY } from "./external.ts";

export const CACHED_BUNDLERS = ["farm", "webpack", "rspack", "rsbuild", "rollup"] as const;
export type CachedBundler = (typeof CACHED_BUNDLERS)[number];

export interface BuildOptions {
  extract?: boolean;
  /** The `VERSION` nishiki builds as, standing in for another build of nishiki; its own when left out. */
  version?: string;
}

export interface Build {
  code: string;
  /** Whether the bundler transformed the module rather than replaying it from its cache. */
  transformed: boolean;
}

const SELF = fileURLToPath(import.meta.url);

/**
 * Build a module with rules into one fresh persistent cache once per entry of `builds`, in order, each in a process of
 * its own, as an upgrade or a new build of the app would.
 */
export async function rebuild(bundler: CachedBundler, builds: BuildOptions[]): Promise<Build[]> {
  // unplugin stores virtual modules under the root as given, but Rspack resolves them to their real path,
  // so under a symlinked root such as macOS's /var the build cannot find nishiki's CSS module.
  const dir = await mkdtemp(path.join(await realpath(tmpdir()), "nishiki-cache-"));
  try {
    await writeFile(
      path.join(dir, "entry.js"),
      `import { css } from "@nishikijs/react";\nexport const styles = css({ color: "red" });\n`,
    );
    const results: Build[] = [];
    for (const options of builds) {
      // Rspack cleans up its cache directory on tasks that outlive `compiler.close()`, and Farm writes a development
      // cache on a detached thread, so only the exit of the process that built is sure to leave the directory alone.
      await promisify(execFile)(process.execPath, ["--conditions=source", SELF, bundler, dir, JSON.stringify(options)]);
      results.push(JSON.parse(await readFile(path.join(dir, "build.json"), "utf8")));
    }
    return results;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Runs only on a module the bundler transforms rather than restores.
let transformed = false;
const counter = createUnplugin(() => ({
  name: "transformed",
  transform: {
    filter: { id: /entry\.js$/ },
    handler() {
      transformed = true;
    },
  },
}));

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
        plugins: [nishiki.farm({ extract }), counter.farm()],
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
      plugins: [nishiki.webpack({ extract }), counter.webpack()],
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
      plugins: [nishiki.rspack({ extract }), counter.rspack()],
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
        plugins: [nishiki.rsbuild({ extract }), counter.rsbuild()],
      },
    });
    const { close } = await rsbuild.build();
    await close();
    return readFile(path.join(dir, "dist", "static", "js", "index.js"), "utf8");
  },

  // Rollup's cache is whatever its caller hands it, here what the previous build left on disk.
  async rollup(dir, extract) {
    const { rollup } = await import("rollup");
    const nishiki = await import("../../../src/unplugin/index.ts");
    const file = path.join(dir, "cache.json");
    const cache = await readFile(file, "utf8").then(JSON.parse, () => undefined);
    const bundle = await rollup({
      input: path.join(dir, "entry.js"),
      external: (id) => NISHIKI_ENTRY.test(id),
      cache,
      plugins: [nishiki.rollup({ extract }), counter.rollup()],
    });
    const { output } = await bundle.generate({ format: "es" });
    await writeFile(file, JSON.stringify(bundle.cache));
    await bundle.close();
    return output[0].code;
  },
};

if (import.meta.main) {
  const [bundler, dir, json] = process.argv.slice(2) as [CachedBundler, string, string];
  const { extract = false, version }: BuildOptions = JSON.parse(json);
  if (version !== undefined) {
    const stub = `export const VERSION = ${JSON.stringify(version)};`;
    registerHooks({
      load: (url, context, next) =>
        url.endsWith("/src/unplugin/version.ts")
          ? { format: "module", source: stub, shortCircuit: true }
          : next(url, context),
    });
  }
  const code = await builds[bundler](dir, extract);
  await writeFile(path.join(dir, "build.json"), JSON.stringify({ code, transformed } satisfies Build));
}
