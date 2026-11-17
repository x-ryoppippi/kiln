import "./node-version.ts";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createUnplugin, type UnpluginInstance } from "unplugin";

import { rollupSplit } from "./split/rollup.ts";
import { viteSplit } from "./split/vite.ts";
import { frameworks, placeholder, webpackSplit } from "./split/webpack.ts";
import {
  CONFIG_ID,
  configModule,
  compileModule,
  CSS_SUFFIX,
  cssModuleId,
  QUICK_FILTER,
  transform,
  type TransformOptions,
} from "./transform.ts";

export type Options = TransformOptions;

const SOURCE = /\.[cm]?[jt]sx?(?:$|\?)/;
const DEPENDENCY = /[\\/]node_modules[\\/]/;
const SELF = fileURLToPath(import.meta.url);

// nishiki's own runtime, which a workspace links outside node_modules: it reads `css` keys that are not styles.
function packageRoot(file: string): string {
  let dir = path.dirname(file);
  while (!existsSync(path.join(dir, "package.json")) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  return dir;
}
const OWN = new RegExp(
  "^" +
    packageRoot(SELF)
      .split(/[\\/]/)
      .map((part) => RegExp.escape(part))
      .join("[\\\\/]+") +
    "[\\\\/]+(?:dist|src)[\\\\/]",
);
const TRANSFORM_FILTER = { id: { include: SOURCE, exclude: [DEPENDENCY, OWN] } };
const CSS_ID = /\.nishiki\.css$/;
const RESOLVED_CONFIG = "\0" + CONFIG_ID;
const CONFIG = new RegExp("^" + RegExp.escape(CONFIG_ID) + "$");
// nishiki's full entries, which load the compiler that a style object left for runtime needs.
const ENTRY = /^@nishikijs\/react(\/jsx-runtime|\/jsx-dev-runtime)?$/;
const NISHIKI_IDS = new RegExp(CSS_ID.source + "|" + CONFIG.source + "|" + ENTRY.source);
// webpack and Rspack load a virtual module from a file named after its URI-encoded id.
const LOADED_IDS = new RegExp(CSS_ID.source + "|(?:^|[\\/\0]|%00)" + RegExp.escape(CONFIG_ID) + "$");
const LEAN_FILE = /[\\/]lean[\\/](?:index|jsx-runtime|jsx-dev-runtime)\.[jt]s$/;
// Bundlers that let the plugin resolve nishiki's entries for the modules it compiled, which get @nishikijs/react/lean.
const LEAN_BUNDLERS = new Set(["vite", "rollup", "rolldown", "webpack", "rspack", "rsbuild", "esbuild", "farm"]);
const ROLLUP_LIKE = new Set(["vite", "rollup", "rolldown"]);

// The inverse of cssModuleId. The source can be any file: SOURCE also matches ids whose JS extension is only in the
// query, such as Vite's `index.html?html-proxy&index=0.js`. nishiki's CSS modules are never on disk, so a real file such
// as `theme.nishiki.css`, or one that happens to sit next to its namesake source, is left to the bundler.
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

// nishiki's CSS modules and config module are imported only for their side effects, so a `"sideEffects": false` in the
// importing source's package.json must not let webpack or Rspack drop them.
function keepCSS(module: { rules?: unknown[] }): void {
  (module.rules ??= []).push({ test: LOADED_IDS, sideEffects: true });
}

// A persistent cache would otherwise replay modules transformed with other options, e.g. without `extract`, or CSS
// modules loaded as placeholders for a build whose sheets nishiki plans.
function versionCache(cache: unknown, options: Options, salt: string): void {
  if (
    typeof cache === "object" &&
    cache !== null &&
    "type" in cache &&
    (cache.type === "filesystem" || cache.type === "persistent")
  ) {
    const version = "version" in cache && typeof cache.version === "string" ? cache.version : "";
    Object.assign(cache, {
      version: [version, "nishiki:" + JSON.stringify(options) + (salt && ":" + salt)].filter(Boolean).join("|"),
    });
  }
}

export const unplugin: UnpluginInstance<Options | undefined, false> = createUnplugin((options = {}, meta) => {
  const cssModules = new Map<string, string>();
  let invalidate: ((id: string) => void) | undefined;
  const compiles = (id: string) => !id.startsWith("\0") && SOURCE.test(id) && !DEPENDENCY.test(id) && !OWN.test(id);
  const split = viteSplit(options, compiles);
  const planned = webpackSplit(options, {
    sourceOf,
    compiles,
    versionCache: (cache, salt) => versionCache(cache, options, salt),
  });
  // Vite's own transform hook below plans per environment instead.
  const bundled =
    options.extract && (meta.framework === "rollup" || meta.framework === "rolldown")
      ? rollupSplit(options, compiles)
      : null;

  const leanFiles = new Set<string>();
  // A module nishiki does not compile, such as a dependency built with nishiki as its JSX import source, can only hand the
  // runtime a style object if its source mentions `css` or `styled`.
  const inertFiles = new Map<string, boolean>();
  const inert = (importer: string) => {
    const file = importer.replace(/[?#].*$/, "");
    let result = inertFiles.get(file);
    if (result === undefined) {
      result = !importer.startsWith("\0") && existsSync(file) && !QUICK_FILTER.test(readFileSync(file, "utf8"));
      inertFiles.set(file, result);
    }
    return result;
  };
  const warned = new Set<string>();

  // The lean entry, without the compiler, for a module nishiki compiles, in a client build: one that leaves a style to
  // runtime imports @nishikijs/react/compiler itself. The choice cannot depend on what the transform saw, since webpack caches a
  // resolution per directory, and webpack and Farm replay cached modules without running the transform.
  // Synchronous unless the bundler resolves for it: unloader rejects a hook that returns a Promise.
  function leanEntry(
    this: { resolve?: Function; environment?: { config: { command: string; consumer: string } } },
    id: string,
    importer: string | undefined,
    ssr: boolean | undefined,
  ): string | null | Promise<string | null> {
    if (
      (options.importSource ?? "@nishikijs/react") !== "@nishikijs/react" ||
      !LEAN_BUNDLERS.has(meta.framework) ||
      !importer
    )
      return null;
    // Vite serves dependencies pre-bundled in development, and leaves them to Node on the server.
    const environment = this.environment?.config ?? { command: "build", consumer: ssr ? "server" : "client" };
    if (environment.command !== "build" || environment.consumer !== "client") return null;
    const config = importer.endsWith(CONFIG_ID);
    if (!config && !compiles(importer) && !inert(importer)) return null;
    const target = id.replace(/^@nishikijs\/react/, "@nishikijs/react/lean");
    if (ROLLUP_LIKE.has(meta.framework) && typeof this.resolve === "function") {
      return Promise.resolve(this.resolve(target, config ? undefined : importer, { skipSelf: true })).then(
        (resolved: { id: string } | null) => resolved?.id ?? null,
      );
    }
    try {
      const file = createRequire(config ? path.join(process.cwd(), "noop.js") : importer).resolve(target);
      // esbuild puts whatever a plugin resolves in the plugin's namespace, where only the plugin loads it.
      if (meta.framework === "esbuild") leanFiles.add(file);
      return file;
    } catch {
      return null;
    }
  }

  const compile = (code: string, id: string, warn: (message: string) => void, cssImport = true) => {
    const result = compileModule(code, id, options, {
      cssImport,
      configImport: true,
    });
    for (const message of result?.warnings ?? []) {
      // Every module under a condition the order misses would warn about it again.
      if (warned.has(message)) continue;
      warned.add(message);
      warn(message);
    }
    if (result?.css && cssModules.get(result.css.id) !== result.css.code) {
      cssModules.set(result.css.id, result.css.code);
      invalidate?.(result.css.id);
    }
    return result;
  };

  return {
    name: "nishiki",
    enforce: "pre",
    buildStart() {
      warned.clear();
    },
    transform: {
      filter: TRANSFORM_FILTER,
      handler(code, id) {
        // webpack tracks loaders as cache dependencies, but nishiki's transform runs inside unplugin's generic loader.
        const native = this.getNativeBuildContext?.();
        const webpackLike = native?.framework === "webpack" || native?.framework === "rspack" ? native : null;
        webpackLike?.loaderContext?.addBuildDependency(SELF);
        const result = compile(code, id, (message) => this.warn(message), !bundled);
        bundled?.record(id, result?.rules ?? []);
        if (webpackLike && result?.css) planned.record(webpackLike.compiler, result.css.id, result.rules);
        return result ? { code: result.code, map: result.map } : undefined;
      },
    },
    // unplugin turns any resolveId into a catch-all Bun onResolve, and Bun then ignores tsconfig's
    // jsxImportSource for every module it matches, which silently disables the css prop.
    resolveId:
      meta.framework === "bun"
        ? undefined
        : {
            filter: { id: NISHIKI_IDS },
            handler(id, importer, extra) {
              if (id === CONFIG_ID) return RESOLVED_CONFIG;
              if (ENTRY.test(id)) return leanEntry.call(this as never, id, importer, (extra as { ssr?: boolean })?.ssr);
              return resolveCSS(id, importer);
            },
          },
    bun: {
      setup(build) {
        build.onResolve({ filter: CSS_ID }, (args) => {
          const resolved = resolveCSS(args.path, args.importer);
          return resolved ? { path: resolved } : undefined;
        });
        if (!options.conditions) return;
        build.onResolve({ filter: CONFIG }, () => ({ path: CONFIG_ID, namespace: "nishiki" }));
        build.onLoad({ filter: CONFIG, namespace: "nishiki" }, () => ({
          contents: configModule(options),
          loader: "js",
        }));
      },
    },
    load: {
      filter: { id: meta.framework === "esbuild" ? [LOADED_IDS, LEAN_FILE] : LOADED_IDS },
      // unloader runs inside Node's synchronous module hooks and rejects a hook that returns a Promise.
      handler(id) {
        if (leanFiles.has(id)) return readFileSync(id, "utf8");
        if (id.endsWith(CONFIG_ID)) return configModule(options);
        const css = (() => {
          const cached = cssModules.get(id);
          if (cached !== undefined) return cached;
          const source = sourceOf(id);
          if (!source) return null;
          // Another process or a cache restore may have produced the importing module, so derive the rules from its
          // source. Not cached: that process, not this one, re-transforms the source when it changes.
          // For a query variant this compiles the whole file on disk. Assuming the plugins before nishiki only move code
          // out of it, as route splitters do, rather than add or rewrite `css()` calls, that is a superset of the
          // variant's rules, which is safe because rules are atomic and idempotent and their layer, not their order,
          // decides precedence.
          this.addWatchFile(source);
          return transform(readFileSync(source, "utf8"), source, options)?.css?.code ?? "";
        })();
        const native = this.getNativeBuildContext?.();
        const webpackLike = native?.framework === "webpack" || native?.framework === "rspack";
        return css !== null && webpackLike && planned.planned(native.compiler) ? placeholder(id, css) : css;
      },
    },
    webpack(compiler) {
      planned.apply(compiler);
      keepCSS(compiler.options.module);
    },
    rspack(compiler) {
      planned.apply(compiler);
      keepCSS(compiler.options.module);
    },
    // unplugin calls neither the webpack nor the rspack hook for the compiler Rsbuild creates.
    rsbuild: {
      setup(api) {
        api.modifyRspackConfig((config, { target }) => {
          keepCSS((config.module ??= {}));
          config.plugins ??= [];
          config.plugins.push({
            apply(compiler: object) {
              // A server environment's target can be web-like, such as `web-worker` for edge rendering.
              frameworks.set(compiler, { client: target === "web" });
              planned.apply(compiler);
            },
          });
        });
      },
    },
    farm: {
      // Farm's persistent cache, on by default, keys on its own config but not on JS plugin options.
      config(config) {
        if (config.compilation?.persistentCache === false) return {};
        return { compilation: { persistentCache: { envs: { nishiki: JSON.stringify(options) } } } };
      },
    },
    rollup: bundled?.hooks,
    rolldown: bundled?.hooks,
    vite: {
      ...split.hooks,
      transform: {
        filter: TRANSFORM_FILTER,
        handler(code, id) {
          const result = compile(code, id, (message) => this.warn(message), !split.planned(this.environment));
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
export { MANIFEST, manifestFile, type ManifestChunk } from "./split/rollup.ts";

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;
  const { mkdtemp, readFile, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { default: webpackCompiler } = await import("webpack");

  describe("@nishikijs/react/lean", () => {
    const resolveEntry = async (
      framework: "vite" | "rollup" | "bun",
      id: string,
      importer: string | undefined,
      { options = {}, environment }: { options?: Options; environment?: { command: string; consumer: string } } = {},
    ) => {
      const plugin = unplugin.raw(options, { framework, versions: {} });
      if (!plugin.resolveId) return null;
      const hook = plugin.resolveId as { handler: (...args: unknown[]) => unknown };
      const context = {
        resolve: async (target: string, from: string | undefined) => ({ id: `resolved:${target}:${from}` }),
        environment: environment && { config: environment },
      };
      return Reflect.apply(hook.handler, context, [id, importer, {}]);
    };
    const source = "/app/src/App.tsx";

    it("gives every module nishiki compiles in a client build the entries without the compiler", async () => {
      for (const id of ["@nishikijs/react", "@nishikijs/react/jsx-runtime", "@nishikijs/react/jsx-dev-runtime"]) {
        const lean = id.replace("@nishikijs/react", "@nishikijs/react/lean");
        expect(await resolveEntry("rollup", id, source)).toBe(`resolved:${lean}:${source}`);
        expect(await resolveEntry("rollup", id, source + "?split=component")).toBe(
          `resolved:${lean}:${source}?split=component`,
        );
      }
      expect(await resolveEntry("rollup", "@nishikijs/react", "\0" + CONFIG_ID)).toBe(
        "resolved:@nishikijs/react/lean:undefined",
      );
      const client = { command: "build", consumer: "client" };
      expect(await resolveEntry("vite", "@nishikijs/react", source, { environment: client })).toBe(
        `resolved:@nishikijs/react/lean:${source}`,
      );
    });

    it("gives the entries without the compiler to a dependency that never mentions css or styled", async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "nishiki-lean-"));
      try {
        const plain = path.join(dir, "node_modules/lib/entry.js");
        const styled = path.join(dir, "node_modules/lib/styled.js");
        const { mkdir } = await import("node:fs/promises");
        await mkdir(path.dirname(plain), { recursive: true });
        await writeFile(
          plain,
          `import { jsx } from "@nishikijs/react/jsx-runtime";\nexport const a = jsx("div", {});\n`,
        );
        await writeFile(
          styled,
          `import { jsx } from "@nishikijs/react/jsx-runtime";\nexport const a = jsx("div", { css: s });\n`,
        );
        expect(await resolveEntry("rollup", "@nishikijs/react/jsx-runtime", plain)).toBe(
          `resolved:@nishikijs/react/lean/jsx-runtime:${plain}`,
        );
        expect(await resolveEntry("rollup", "@nishikijs/react/jsx-runtime", styled)).toBeNull();
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it("leaves the full entries to dependencies, other runtimes, other import sources and Vite's dev server", async () => {
      expect(await resolveEntry("rollup", "@nishikijs/react", "/app/node_modules/lib/index.js")).toBeNull();
      expect(await resolveEntry("rollup", "@nishikijs/react", "C:\\app\\node_modules\\lib\\index.js")).toBeNull();
      expect(await resolveEntry("rollup", "@nishikijs/react", "/app/src/page.mdx")).toBeNull();
      expect(await resolveEntry("rollup", "@nishikijs/react/core", source)).toBeNull();
      expect(
        await resolveEntry("rollup", "@nishikijs/react", source, { options: { importSource: "acme" } }),
      ).toBeNull();
      expect(await resolveEntry("bun", "@nishikijs/react", source)).toBeNull();
      for (const environment of [
        { command: "serve", consumer: "client" },
        { command: "build", consumer: "server" },
      ]) {
        expect(await resolveEntry("vite", "@nishikijs/react", source, { environment })).toBeNull();
      }
    });
  });

  describe("dependencies", () => {
    it("are left uncompiled on POSIX and Windows paths alike", () => {
      for (const id of ["/app/node_modules/lib/index.js", "C:\\app\\node_modules\\lib\\index.js"]) {
        expect(
          TRANSFORM_FILTER.id.exclude.some((pattern) => pattern.test(id)),
          id,
        ).toBe(true);
      }
      expect(TRANSFORM_FILTER.id.exclude.some((pattern) => pattern.test("C:\\app\\src\\App.tsx"))).toBe(false);
    });
  });

  describe("bun", () => {
    it("resolves only nishiki's CSS ids, so Bun keeps applying tsconfig's jsxImportSource", async () => {
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
      const dir = await mkdtemp(path.join(tmpdir(), "nishiki-css-"));
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

    it("leave a .nishiki.css import alone when no source file backs it", async () => {
      const { resolveId } = unplugin.raw({ extract: true }, { framework: "rollup", versions: {} });
      if (typeof resolveId !== "object") throw new Error("expected an object hook");
      const resolve = (id: string) => Reflect.apply(resolveId.handler, {}, [id, "/app/src/page.tsx", {}]);
      expect(await resolve(`./theme${CSS_SUFFIX}`)).toBeNull();
      expect(await resolve(`/app/src/theme${CSS_SUFFIX}`)).toBeNull();
    });

    it("follow their source when it changes in another process", async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "nishiki-css-"));
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
      `import { css } from "@nishikijs/react";`,
      `export const loader = css({ color: "red" });`,
      `export const Page = () => <main css={{ color: "blue" }} />;`,
    ].join("\n");
    const component = `export const Page = () => <main css={{ color: "blue" }} />;\n`;

    async function withPage(run: (source: string) => Promise<void>) {
      const dir = await mkdtemp(path.join(tmpdir(), "nishiki-variant-"));
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
      } = unplugin.raw({ extract: true }, { framework: "farm", versions: {} });
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
        await writeFile(path.join(dir, "theme.nishiki.css"), "");
        await writeFile(path.join(dir, "index.html"), "");
        expect(sourceOf(source + CSS_SUFFIX)).toBe(source);
        expect(sourceOf(`${source}.v1a2b${CSS_SUFFIX}`)).toBe(source);
        expect(sourceOf(cssModuleId(source + "?split=component"))).toBe(source);
        expect(sourceOf(path.join(dir, "util.mts") + CSS_SUFFIX)).toBe(path.join(dir, "util.mts"));
        expect(sourceOf(path.join(dir, "theme.nishiki.css"))).toBeNull();
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

    it("leave a real .nishiki.css file to the bundler", () =>
      withPage(async (source) => {
        const theme = path.join(path.dirname(source), "theme.nishiki.css");
        await writeFile(theme, ".theme{}");
        expect(await hooks().load(theme)).toBeNull();
      }));
  });

  describe("webpack", () => {
    it("makes nishiki's own code a build dependency, so upgrading it invalidates the cache", async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "nishiki-webpack-"));
      await writeFile(
        path.join(dir, "entry.js"),
        `import { css } from "@nishikijs/react";\nexport const styles = css({ color: "red" });\n`,
      );
      const compiler = webpackCompiler({
        mode: "development",
        context: dir,
        entry: "./entry.js",
        output: { path: path.join(dir, "dist") },
        externals: { "@nishikijs/react": "commonjs @nishikijs/react" },
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
}
