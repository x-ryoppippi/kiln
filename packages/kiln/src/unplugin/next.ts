import { unplugin, type Options } from "./index.ts";
import { frameworks } from "./split/webpack.ts";

// No index signatures: Next.js declares its config as interfaces, which are not assignable to them.
interface NextConfigLike {
  turbopack?: { rules?: Record<string, unknown> };
  webpack?: ((config: any, context: any) => any) | null;
}

const SOURCE_GLOBS = ["*.js", "*.jsx", "*.mjs", "*.ts", "*.tsx", "*.mts"];
const SHELLS = ["layout", "template"];

// The App Router renders a page, or a loading, error or not-found file, inside the layout and template of its segment
// and of every segment above it, and a template inside its segment's layout. Next.js builds a client entry for each of
// those files, named after its path without the extension, and links the stylesheets of every entry it renders.
export function appRouterLoadsWith(entry: string, entries: ReadonlySet<string>): string[] {
  const segments = entry.split("/");
  const file = segments.pop()!;
  if (segments[0] !== "app") return [];
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
 * Add kiln's compiler to a Next.js config, for both webpack and Turbopack.
 * Turbopack runs it as a loader, so `extract` only takes effect under webpack.
 */
export default function withKiln<Config extends NextConfigLike>(config: Config, options: Options = {}): Config {
  const rule = {
    condition: { not: "foreign" },
    loaders: [{ loader: "kiln/unplugin/loader", options: { ...options, extract: false } }],
  };

  return {
    ...config,
    turbopack: {
      ...config.turbopack,
      rules: {
        ...config.turbopack?.rules,
        ...Object.fromEntries(SOURCE_GLOBS.map((glob) => [glob, rule])),
      },
    },
    webpack(webpackConfig: { plugins: unknown[] }, context: { isServer?: boolean }) {
      const kiln = unplugin.webpack(options);
      webpackConfig.plugins.push({
        apply(compiler: Parameters<typeof kiln.apply>[0]) {
          // Next.js gives its edge server build a web target too, but serves only the client build's stylesheets.
          frameworks.set(compiler, { client: !context.isServer, loadsWith: appRouterLoadsWith });
          kiln.apply(compiler);
        },
      });
      return config.webpack ? config.webpack(webpackConfig, context) : webpackConfig;
    },
  };
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;

  // Loosely typed so tests can pass partial configs; the typed path is covered by the interface test below.
  const kiln = (config: any, options?: Options): any => withKiln(config, options);

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

    it("leaves entries outside the app directory alone", () => {
      expect(shellsOf("main-app")).toEqual([]);
      expect(appRouterLoadsWith("pages/index", entries)).toEqual([]);
    });
  });

  describe("withKiln", () => {
    it("adds a Turbopack loader rule for every source extension, keeping existing rules and keys", () => {
      const svg = { loaders: ["@svgr/webpack"], as: "*.js" };
      const config = kiln(
        { reactStrictMode: true, turbopack: { root: "/repo", rules: { "*.svg": svg } } },
        { importSource: "my-kiln", extract: true },
      );
      expect(config.reactStrictMode).toBe(true);
      expect(config.turbopack?.root).toBe("/repo");
      expect(config.turbopack?.rules?.["*.svg"]).toBe(svg);
      expect(Object.keys(config.turbopack?.rules ?? {})).toEqual(["*.svg", ...SOURCE_GLOBS]);
      expect(config.turbopack?.rules?.["*.tsx"]).toEqual({
        condition: { not: "foreign" },
        loaders: [{ loader: "kiln/unplugin/loader", options: { importSource: "my-kiln", extract: false } }],
      });
    });

    it("adds the webpack plugin before calling an existing webpack function", () => {
      const seen: unknown[] = [];
      const config = kiln({
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
      expect(kiln({}).webpack!(webpackConfig, {})).toBe(webpackConfig);
      expect(kiln({ webpack: null }).webpack!(webpackConfig, {})).toBe(webpackConfig);
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

      const result = withKiln(config);

      expect(result.reactStrictMode).toBe(true);
      expect(result.turbopack?.root).toBe("/app");
      expect(Object.keys(result.turbopack?.rules ?? {})).toEqual(["*.svg", ...SOURCE_GLOBS]);
    });
  });
}
