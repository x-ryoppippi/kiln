import { unplugin, type Options } from "./index.ts";
import type { LoaderOptions } from "./loader.ts";
import { compact } from "./split/build.ts";
import { frameworks, planChunks, type ChunkNode, type GroupNode } from "./split/webpack.ts";

// No index signatures: Next.js declares its config as interfaces, which are not assignable to them.
interface NextConfigLike {
  turbopack?: { rules?: Record<string, unknown> };
  webpack?: ((config: any, context: any) => any) | null;
}

const SOURCE_GLOBS = ["*.js", "*.jsx", "*.mjs", "*.ts", "*.tsx", "*.mts"];
const SHELLS = ["layout", "template"];
const STANDALONE = new Set(["app/global-error", "app/_global-error/page", "app/global-not-found"]);

// The App Router renders a page, or a loading, error or not-found file, inside the layout and template of its segment
// and of every segment above it, and a template inside its segment's layout. Next.js builds a client entry for each of
// those files, named after its path without the extension, and links the stylesheets of every entry it renders.
// global-error and global-not-found replace the root layout instead, as do the routes that render them: the global
// error route always, and the not-found route once `experimental.globalNotFound` is on, with or without the file.
export function appRouterLoadsWith(
  entry: string,
  entries: ReadonlySet<string>,
  { globalNotFound = false }: { globalNotFound?: boolean } = {},
): string[] {
  const segments = entry.split("/");
  const file = segments.pop()!;
  if (segments[0] !== "app" || STANDALONE.has(entry) || (globalNotFound && entry === "app/_not-found/page")) return [];
  const shells: string[] = [];
  for (let depth = 1; depth <= segments.length; depth++) {
    const dir = segments.slice(0, depth).join("/");
    const own = depth === segments.length;
    for (const shell of SHELLS) {
      // A layout does not render inside its own segment's template, nor anything inside itself.
      if (own && (shell === file || (file === "layout" && shell === "template"))) continue;
      if (entries.has(`${dir}/${shell}`)) shells.push(`${dir}/${shell}`);
    }
  }
  return shells;
}

/**
 * Add nishiki's compiler to a Next.js config, for both webpack and Turbopack.
 * Turbopack runs it as a loader, so `extract` only takes effect under webpack.
 */
export default function withNishiki<Config extends NextConfigLike>(config: Config, options: Options = {}): Config {
  if (compact(options)) {
    throw new Error(
      `[nishiki] extract: { classNames: "compact" } names rules in the client build alone, but Next.js renders them on ` +
        `the server too; leave it out.`,
    );
  }
  // Turbopack compiles a module once for the browser and once per server environment, which keep the full entries.
  const rule = (lean: boolean) => ({
    condition: { all: [{ not: "foreign" }, lean ? "browser" : { not: "browser" }] },
    loaders: [
      {
        loader: "@nishikijs/react/unplugin/loader",
        options: { ...options, extract: false, lean } satisfies LoaderOptions,
      },
    ],
  });
  const rules = [rule(true), rule(false)];

  return {
    ...config,
    turbopack: {
      ...config.turbopack,
      rules: {
        ...config.turbopack?.rules,
        ...Object.fromEntries(SOURCE_GLOBS.map((glob) => [glob, rules])),
      },
    },
    webpack(
      webpackConfig: { plugins: unknown[] },
      context: { isServer?: boolean; config?: { experimental?: { globalNotFound?: boolean } } },
    ) {
      const nishiki = unplugin.webpack(options);
      webpackConfig.plugins.push({
        apply(compiler: Parameters<typeof nishiki.apply>[0]) {
          // Next.js gives its edge server build a web target too, but serves only the client build's stylesheets.
          const globalNotFound = context.config?.experimental?.globalNotFound ?? false;
          frameworks.set(compiler, {
            client: !context.isServer,
            loadsWith: (entry, entries) => appRouterLoadsWith(entry, entries, { globalNotFound }),
          });
          nishiki.apply(compiler);
        },
      });
      return config.webpack ? config.webpack(webpackConfig, context) : webpackConfig;
    },
  };
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;

  // Loosely typed so tests can pass partial configs; the typed path is covered by the interface test below.
  const nishiki = (config: any, options?: Options): any => withNishiki(config, options);

  describe("appRouterLoadsWith", () => {
    const entries = new Set([
      "main-app",
      "app/layout",
      "app/page",
      "app/template",
      "app/blog/layout",
      "app/blog/page",
      "app/blog/[slug]/page",
      "app/blog/[slug]/loading",
      "app/(shop)/layout",
      "app/(shop)/cart/template",
      "app/(shop)/cart/page",
    ]);
    const shellsOf = (entry: string) => appRouterLoadsWith(entry, entries);

    it("loads a page with the layouts and templates of its segment and every segment above it", () => {
      expect(shellsOf("app/page")).toEqual(["app/layout", "app/template"]);
      expect(shellsOf("app/blog/[slug]/page")).toEqual(["app/layout", "app/template", "app/blog/layout"]);
      expect(shellsOf("app/blog/[slug]/loading")).toEqual(["app/layout", "app/template", "app/blog/layout"]);
      expect(shellsOf("app/(shop)/cart/page")).toEqual([
        "app/layout",
        "app/template",
        "app/(shop)/layout",
        "app/(shop)/cart/template",
      ]);
    });

    it("loads a layout with the shells above it, and a template with its own segment's layout", () => {
      expect(shellsOf("app/layout")).toEqual([]);
      expect(shellsOf("app/template")).toEqual(["app/layout"]);
      expect(shellsOf("app/blog/layout")).toEqual(["app/layout", "app/template"]);
      expect(shellsOf("app/(shop)/cart/template")).toEqual(["app/layout", "app/template", "app/(shop)/layout"]);
    });

    it("loads global-error, global-not-found and the global error route alone, since they replace the root layout", () => {
      const all = new Set([...entries, "app/global-error", "app/_global-error/page", "app/global-not-found"]);
      for (const entry of ["app/global-error", "app/_global-error/page", "app/global-not-found"]) {
        expect(appRouterLoadsWith(entry, all), entry).toEqual([]);
      }
    });

    it("loads the not-found route in the root layout unless experimental.globalNotFound replaces it", () => {
      const all = new Set([...entries, "app/_not-found/page"]);
      expect(appRouterLoadsWith("app/_not-found/page", all)).toEqual(["app/layout", "app/template"]);
      expect(appRouterLoadsWith("app/_not-found/page", all, { globalNotFound: true })).toEqual([]);
    });

    it("keeps a rule that global-not-found shares with the root layout in its own sheet", () => {
      const names = ["app/layout", "app/global-not-found"];
      const chunks = new Map<string, ChunkNode>(
        names.map((name) => [name, { name, modules: [name], dynamicImports: [], stylesheet: true }]),
      );
      const groups = new Map<string, GroupNode>(
        names.map((name) => [
          name,
          { name, chunks: [name], initial: true, loadsWith: appRouterLoadsWith(name, new Set(names)) },
        ]),
      );
      const { sheets } = planChunks(chunks, groups, () => ["shared"], "chunks");
      expect(sheets.get("app/global-not-found")).toEqual(["shared"]);
    });

    it("leaves entries outside the app directory alone", () => {
      expect(shellsOf("main-app")).toEqual([]);
      expect(appRouterLoadsWith("pages/index", entries)).toEqual([]);
    });
  });

  describe("withNishiki", () => {
    it("adds a Turbopack loader rule for every source extension, keeping existing rules and keys", () => {
      const svg = { loaders: ["@svgr/webpack"], as: "*.js" };
      const config = nishiki(
        { reactStrictMode: true, turbopack: { root: "/repo", rules: { "*.svg": svg } } },
        { importSource: "my-nishiki", extract: true },
      );
      expect(config.reactStrictMode).toBe(true);
      expect(config.turbopack?.root).toBe("/repo");
      expect(config.turbopack?.rules?.["*.svg"]).toBe(svg);
      expect(Object.keys(config.turbopack?.rules ?? {})).toEqual(["*.svg", ...SOURCE_GLOBS]);
      const loader = (lean: boolean) => ({
        loader: "@nishikijs/react/unplugin/loader",
        options: { importSource: "my-nishiki", extract: false, lean },
      });
      expect(config.turbopack?.rules?.["*.tsx"]).toEqual([
        { condition: { all: [{ not: "foreign" }, "browser"] }, loaders: [loader(true)] },
        { condition: { all: [{ not: "foreign" }, { not: "browser" }] }, loaders: [loader(false)] },
      ]);
    });

    it("adds the webpack plugin before calling an existing webpack function", () => {
      const seen: unknown[] = [];
      const config = nishiki({
        webpack(webpackConfig: { plugins: unknown[] }, context: unknown) {
          seen.push(webpackConfig.plugins.length, context);
          return { ...webpackConfig, extra: true };
        },
      });
      const context = { isServer: false };
      const result = config.webpack!({ plugins: ["existing"] }, context);
      expect(seen).toEqual([2, context]);
      expect(result.extra).toBe(true);
      expect(result.plugins[0]).toBe("existing");
      expect(result.plugins[1]).toHaveProperty("apply");
    });

    it("returns the webpack config when there is no webpack function to chain", () => {
      const webpackConfig = { plugins: [] };
      expect(nishiki({}).webpack!(webpackConfig, {})).toBe(webpackConfig);
      expect(nishiki({ webpack: null }).webpack!(webpackConfig, {})).toBe(webpackConfig);
      expect(webpackConfig.plugins).toHaveLength(2);
    });

    it("accepts a config declared with interfaces, as Next.js declares NextConfig", () => {
      interface TurbopackOptions {
        rules?: Record<string, { loaders: string[] }>;
        root?: string;
      }
      interface Config {
        reactStrictMode?: boolean;
        turbopack?: TurbopackOptions;
      }
      const config: Config = {
        reactStrictMode: true,
        turbopack: { root: "/app", rules: { "*.svg": { loaders: ["svgr"] } } },
      };

      const result = withNishiki(config);

      expect(result.reactStrictMode).toBe(true);
      expect(result.turbopack?.root).toBe("/app");
      expect(Object.keys(result.turbopack?.rules ?? {})).toEqual(["*.svg", ...SOURCE_GLOBS]);
    });
  });
}
