import { unplugin, type Options } from "./index.ts";

interface NextConfigLike {
  turbopack?: { rules?: Record<string, unknown>; [key: string]: unknown };
  webpack?: ((config: any, context: any) => any) | null;
  [key: string]: unknown;
}

const SOURCE_GLOBS = ["*.js", "*.jsx", "*.mjs", "*.ts", "*.tsx", "*.mts"];

/**
 * Add kiln's compiler to a Next.js config, for both webpack and Turbopack.
 * Turbopack runs it as a loader, so `extract` only takes effect under webpack.
 */
export default function withKiln<Config extends NextConfigLike>(config: Config, options: Options = {}): Config {
  const rule = {
    condition: { not: "foreign" },
    loaders: [{ loader: "unplugin-kiln/loader", options: { ...options, extract: false } }],
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
    webpack(webpackConfig: { plugins: unknown[] }, context: unknown) {
      webpackConfig.plugins.push(unplugin.webpack(options));
      return config.webpack ? config.webpack(webpackConfig, context) : webpackConfig;
    },
  };
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;

  const kiln = (config: NextConfigLike, options?: Options) => withKiln<NextConfigLike>(config, options);

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
        loaders: [{ loader: "unplugin-kiln/loader", options: { importSource: "my-kiln", extract: false } }],
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
  });
}
