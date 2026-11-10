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
