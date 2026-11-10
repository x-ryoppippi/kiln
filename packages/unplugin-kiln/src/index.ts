import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createUnplugin, type UnpluginInstance } from "unplugin";

import { viteSplit } from "./split/vite.ts";
import { compileModule, CSS_SUFFIX, cssModuleId, transform, type TransformOptions } from "./transform.ts";

export type Options = TransformOptions;

const SOURCE = /\.[cm]?[jt]sx?(?:$|\?)/;
const DEPENDENCY = /\/node_modules\//;
const TRANSFORM_FILTER = { id: { include: SOURCE, exclude: DEPENDENCY } };
const CSS_ID = /\.kiln\.css$/;
const SELF = fileURLToPath(import.meta.url);

// The inverse of cssModuleId. The source can be any file: SOURCE also matches ids whose JS extension is only in the
// query, such as Vite's `index.html?html-proxy&index=0.js`. kiln's CSS modules are never on disk, so a real file such
// as `theme.kiln.css`, or one that happens to sit next to its namesake source, is left to the bundler.
function sourceOf(cssId: string): string | null {
  if (!CSS_ID.test(cssId) || existsSync(cssId)) return null;
  const named = cssId.slice(0, -CSS_SUFFIX.length);
  for (const source of [named, named.replace(/\.v[0-9a-z]+$/, "")]) {
    if (existsSync(source)) return source;
  }
  return null;
}

function resolveCSS(id: string, importer: string | undefined): string | null {
  const resolved =
    id.startsWith(".") && importer
      ? path.resolve(path.dirname(importer.replace(/[?#].*$/, "")), id)
      : path.isAbsolute(id)
        ? id
        : null;
  return resolved && sourceOf(resolved) ? resolved : null;
}

// A persistent cache would otherwise replay modules transformed with other options, e.g. without `extract`.
function versionCache(cache: { type?: string; version?: string } | boolean | undefined, options: Options): void {
  if (typeof cache === "object" && (cache.type === "filesystem" || cache.type === "persistent")) {
    cache.version = [cache.version, "kiln:" + JSON.stringify(options)].filter(Boolean).join("|");
  }
}

export const unplugin: UnpluginInstance<Options | undefined, false> = createUnplugin((options = {}, meta) => {
  const cssModules = new Map<string, string>();
  let invalidate: ((id: string) => void) | undefined;
  const split = viteSplit(options, (id) => !id.startsWith("\0") && SOURCE.test(id) && !DEPENDENCY.test(id));

  const compile = (code: string, id: string, cssImport = true) => {
    const result = compileModule(code, id, options, cssImport);
    if (result?.css && cssModules.get(result.css.id) !== result.css.code) {
      cssModules.set(result.css.id, result.css.code);
      invalidate?.(result.css.id);
    }
    return result;
  };

  return {
    name: "kiln",
    enforce: "pre",
    transform: {
      filter: TRANSFORM_FILTER,
      handler(code, id) {
        // webpack tracks loaders as cache dependencies, but kiln's transform runs inside unplugin's generic loader.
        const native = this.getNativeBuildContext?.();
        if (native?.framework === "webpack" || native?.framework === "rspack") {
          native.loaderContext?.addBuildDependency(SELF);
        }
        const result = compile(code, id);
        return result ? { code: result.code, map: result.map } : undefined;
      },
    },
    // unplugin turns any resolveId into a catch-all Bun onResolve, and Bun then ignores tsconfig's
    // jsxImportSource for every module it matches, which silently disables the css prop.
    resolveId:
      meta.framework === "bun"
        ? undefined
        : { filter: { id: CSS_ID }, handler: (id, importer) => resolveCSS(id, importer) },
    bun: {
      setup(build) {
        build.onResolve({ filter: CSS_ID }, (args) => {
          const resolved = resolveCSS(args.path, args.importer);
          return resolved ? { path: resolved } : undefined;
        });
      },
    },
    load: {
      filter: { id: CSS_ID },
      // unloader runs inside Node's synchronous module hooks and rejects a hook that returns a Promise.
      handler(id) {
        const cached = cssModules.get(id);
        if (cached !== undefined) return cached;
        const source = sourceOf(id);
        if (!source) return null;
        // Another process or a cache restore may have produced the importing module, so derive the rules from its source.
        // Not cached: that process, not this one, re-transforms the source when it changes.
        // For a query variant this compiles the whole file on disk. Assuming the plugins before kiln only move code out
        // of it, as route splitters do, rather than add or rewrite `css()` calls, that is a superset of the variant's
        // rules, which is safe because rules are atomic and idempotent and their layer, not their order, decides precedence.
        this.addWatchFile(source);
        return transform(readFileSync(source, "utf8"), source, options)?.css?.code ?? "";
      },
    },
    webpack(compiler) {
      versionCache(compiler.options.cache, options);
    },
    rspack(compiler) {
      versionCache(compiler.options.cache, options);
    },
    // unplugin calls neither the webpack nor the rspack hook for the compiler Rsbuild creates.
    rsbuild: {
      setup(api) {
        api.modifyRspackConfig((config) => versionCache(config.cache, options));
      },
    },
    farm: {
      // Farm's persistent cache, on by default, keys on its own config but not on JS plugin options.
      config(config) {
        if (config.compilation?.persistentCache === false) return {};
        return { compilation: { persistentCache: { envs: { kiln: JSON.stringify(options) } } } };
      },
    },
    vite: {
      ...split.hooks,
      transform: {
        filter: TRANSFORM_FILTER,
        handler(code, id) {
          const result = compile(code, id, !split.planned(this.environment));
          split.record(this.environment, id, result);
          return result ? { code: result.code, map: result.map } : undefined;
        },
      },
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
export const rsbuild: UnpluginInstance<Options | undefined, false>["rsbuild"] = unplugin.rsbuild;
export const esbuild: UnpluginInstance<Options | undefined, false>["esbuild"] = unplugin.esbuild;
export const bun: UnpluginInstance<Options | undefined, false>["bun"] = unplugin.bun;
export const farm: UnpluginInstance<Options | undefined, false>["farm"] = unplugin.farm;
export const unloader: UnpluginInstance<Options | undefined, false>["unloader"] = unplugin.unloader;
export { transform, type TransformOptions, type TransformResult } from "./transform.ts";

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;
  const { mkdtemp, readFile, realpath, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { default: webpackCompiler } = await import("webpack");

  describe("bun", () => {
    it("resolves only kiln's CSS ids, so Bun keeps applying tsconfig's jsxImportSource", async () => {
      const plugin = unplugin.raw({ extract: true }, { framework: "bun", versions: {} });
      expect(plugin.resolveId).toBeUndefined();

      type Resolver = (args: { path: string; importer: string }) => unknown;
      const resolvers: [RegExp, Resolver][] = [];
      const build = {
        onResolve: (options: { filter: RegExp }, callback: Resolver) => void resolvers.push([options.filter, callback]),
      };
      type Build = Parameters<NonNullable<NonNullable<typeof plugin.bun>["setup"]>>[0];
      await plugin.bun?.setup?.(build as unknown as Build);

      expect(resolvers.map(([filter]) => filter)).toEqual([CSS_ID]);
      const importer = SELF;
      expect(resolvers[0]![1]({ path: `./${path.basename(importer)}${CSS_SUFFIX}`, importer })).toEqual({
        path: importer + CSS_SUFFIX,
      });
    });
  });

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
        expect(Reflect.apply(load.handler, context, [id])).toBe(imported.css!.code);
        expect(watched).toEqual([source]);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it("leave a .kiln.css import alone when no source file backs it", async () => {
      const { resolveId } = unplugin.raw({ extract: true }, { framework: "rollup", versions: {} });
      if (typeof resolveId !== "object") throw new Error("expected an object hook");
      const resolve = (id: string) => Reflect.apply(resolveId.handler, {}, [id, "/app/src/page.tsx", {}]);
      expect(await resolve(`./theme${CSS_SUFFIX}`)).toBeNull();
      expect(await resolve(`/app/src/theme${CSS_SUFFIX}`)).toBeNull();
    });

    it("follow their source when it changes in another process", async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "kiln-css-"));
      const source = path.join(dir, "page.tsx");
      const id = source + CSS_SUFFIX;
      const { load } = unplugin.raw({ extract: true }, { framework: "rollup", versions: {} });
      if (typeof load !== "object") throw new Error("expected an object hook");
      const context = { addWatchFile: () => {} };

      try {
        await writeFile(source, `export const Page = () => <main css={{ color: "red" }} />;\n`);
        expect(await Reflect.apply(load.handler, context, [id])).toContain("red");
        await writeFile(source, `export const Page = () => <main css={{ color: "blue" }} />;\n`);
        const css = await Reflect.apply(load.handler, context, [id]);
        expect(css).toContain("blue");
        expect(css).not.toContain("red");
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe("query variants", () => {
    // A stand-in for a code splitter: the `?split=component` variant keeps only the component.
    const page = [
      `import { css } from "kiln";`,
      `export const loader = css({ color: "red" });`,
      `export const Page = () => <main css={{ color: "blue" }} />;`,
    ].join("\n");
    const component = `export const Page = () => <main css={{ color: "blue" }} />;\n`;

    async function withPage(run: (source: string) => Promise<void>) {
      const dir = await mkdtemp(path.join(tmpdir(), "kiln-variant-"));
      const source = path.join(dir, "page.tsx");
      await writeFile(source, page);
      try {
        await run(source);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }

    function hooks() {
      const {
        transform: transformHook,
        resolveId,
        load,
      } = unplugin.raw({ extract: true }, { framework: "rollup", versions: {} });
      if (typeof transformHook !== "object" || typeof resolveId !== "object" || typeof load !== "object") {
        throw new Error("expected object hooks");
      }
      const context = { addWatchFile: () => {} };
      return {
        transform: (code: string, id: string) => Reflect.apply(transformHook.handler, context, [code, id]),
        resolve: (id: string, importer: string) => Reflect.apply(resolveId.handler, context, [id, importer, {}]),
        load: (id: string) => Reflect.apply(load.handler, context, [id]),
      };
    }

    it("find the source behind a CSS id, with or without a tag", () =>
      withPage(async (source) => {
        const dir = path.dirname(source);
        await writeFile(path.join(dir, "util.mts"), "");
        await writeFile(path.join(dir, "theme.kiln.css"), "");
        await writeFile(path.join(dir, "index.html"), "");
        expect(sourceOf(source + CSS_SUFFIX)).toBe(source);
        expect(sourceOf(`${source}.v1a2b${CSS_SUFFIX}`)).toBe(source);
        expect(sourceOf(cssModuleId(source + "?split=component"))).toBe(source);
        expect(sourceOf(path.join(dir, "util.mts") + CSS_SUFFIX)).toBe(path.join(dir, "util.mts"));
        expect(sourceOf(path.join(dir, "theme.kiln.css"))).toBeNull();
        expect(sourceOf(path.join(dir, "missing.tsx") + CSS_SUFFIX)).toBeNull();
        await writeFile(`${source}.vabc${CSS_SUFFIX}`, "");
        expect(sourceOf(`${source}.vabc${CSS_SUFFIX}`)).toBeNull();
        const html = path.join(dir, "index.html");
        expect(sourceOf(cssModuleId(html + "?html-proxy&index=0.js"))).toBe(html);
      }));

    it("resolve a tagged CSS id to itself", () =>
      withPage(async (source) => {
        const id = cssModuleId(source + "?split=component");
        expect(await hooks().resolve("./" + path.basename(id), source + "?split=component")).toBe(id);
      }));

    it("load the rules of the variant this process compiled", () =>
      withPage(async (source) => {
        const { transform: run, load } = hooks();
        await run(component, source + "?split=component");
        const css = await load(cssModuleId(source + "?split=component"));
        expect(css).toContain("blue");
        expect(css).not.toContain("red");
      }));

    it("load a superset of a variant's rules when this process never compiled it", () =>
      withPage(async (source) => {
        const css = await hooks().load(cssModuleId(source + "?split=component"));
        expect(css).toContain("blue");
        expect(css).toContain("red");
      }));

    it("leave a real .kiln.css file to the bundler", () =>
      withPage(async (source) => {
        const theme = path.join(path.dirname(source), "theme.kiln.css");
        await writeFile(theme, ".theme{}");
        expect(await hooks().load(theme)).toBeNull();
      }));
  });

  describe("farm", () => {
    it("does not replay modules cached with other options", async () => {
      const { createCompiler, Logger, resolveConfig } = await import("@farmfe/core");
      const logger = new Logger();
      const dir = await mkdtemp(path.join(tmpdir(), "kiln-farm-"));
      await writeFile(
        path.join(dir, "entry.js"),
        `import { css } from "kiln";\nexport const styles = css({ color: "red" });\n`,
      );

      const build = async (extract: boolean) => {
        const config = await resolveConfig(
          {
            // unplugin resolves the importers Farm passes, which are relative to the root, against the cwd.
            root: process.cwd(),
            compilation: {
              input: { main: path.join(dir, "entry.js") },
              output: { targetEnv: "library-node" },
              external: ["kiln"],
              minify: false,
              persistentCache: { cacheDir: path.join(dir, "cache") },
            },
            plugins: [unplugin.farm({ extract })],
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
      };

      try {
        expect(await build(false)).toContain("color:red");
        expect(await build(true)).not.toContain("color:red");
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

  describe("persistent caches", () => {
    async function rebuild(build: (dir: string, extract: boolean) => Promise<string>) {
      // unplugin stores virtual modules under the root as given, but Rspack resolves them to their real path,
      // so under a symlinked root such as macOS's /var the build cannot find kiln's CSS module.
      const dir = await mkdtemp(path.join(await realpath(tmpdir()), "kiln-cache-"));
      await writeFile(
        path.join(dir, "entry.js"),
        `import { css } from "kiln";\nexport const styles = css({ color: "red" });\n`,
      );
      try {
        return [await build(dir, false), await build(dir, true)];
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }

    it("do not replay modules Rspack cached with other options", async () => {
      const { rspack } = await import("@rspack/core");
      const [runtime, extracted] = await rebuild(
        (dir, extract) =>
          new Promise((done, fail) => {
            const compiler = rspack({
              mode: "development",
              context: dir,
              entry: "./entry.js",
              output: { path: path.join(dir, "dist"), library: { type: "commonjs" } },
              cache: { type: "persistent", storage: { type: "filesystem", directory: path.join(dir, "cache") } },
              externals: ({ request }, callback) =>
                request === "kiln" || request?.endsWith(".css")
                  ? callback(undefined, "commonjs " + request)
                  : callback(),
              plugins: [unplugin.rspack({ extract })],
            });
            compiler.run((error, stats) => {
              compiler.close(() => {
                if (error || stats?.hasErrors()) fail(error ?? new Error(stats?.toString()));
                else done(readFile(path.join(dir, "dist", "main.js"), "utf8"));
              });
            });
          }),
      );
      expect(runtime).toContain("color:red");
      expect(extracted).not.toContain("color:red");
    });

    it("do not replay modules Rsbuild cached with other options", async () => {
      const { createRsbuild } = await import("@rsbuild/core");
      const [runtime, extracted] = await rebuild(async (dir, extract) => {
        const rsbuild = await createRsbuild({
          cwd: dir,
          loadEnv: false,
          rsbuildConfig: {
            mode: "development",
            logLevel: "silent",
            source: { entry: { index: "./entry.js" } },
            output: { filenameHash: false, externals: { kiln: "kiln" } },
            performance: { buildCache: { cacheDirectory: path.join(dir, "cache") } },
            plugins: [unplugin.rsbuild({ extract })],
          },
        });
        const { close } = await rsbuild.build();
        await close();
        return readFile(path.join(dir, "dist", "static", "js", "index.js"), "utf8");
      });
      expect(runtime).toContain("color:red");
      expect(extracted).not.toContain("color:red");
    });
  });
}
