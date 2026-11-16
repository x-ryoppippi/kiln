---
title: Bundler setup
description: Add the build-time compiler to Vite, Rollup, Rolldown, webpack, Rspack, Rsbuild, esbuild, Bun, Farm, unloader or Next.js.
---

# Bundler setup

The compiler is an [unplugin](https://unplugin.unjs.io) shipped in the same package as the runtime, so there is nothing else to install. It compiles the literal parts of `css(...)`, `styled(_, {...})` and `css={{...}}` with oxc at build time, using the same code as the runtime, so class names are identical either way.

Each bundler has its own entry, `kiln/unplugin/<bundler>`. Two rules apply to all of them:

- Run the compiler **before the JSX transform**, which must use `kiln` as its import source.
- Place it **after plugins that move code between modules**, such as TanStack Router's code splitting, so each module it compiles imports only the rules its own code uses.

Every bundler below has a runnable project in [`examples/`](https://github.com/x-ryoppippi/kiln/tree/main/examples).

::: code-group

```ts [Vite]
// vite.config.ts
import react from "@vitejs/plugin-react";
import kiln from "kiln/unplugin/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [kiln(), react({ jsxImportSource: "kiln" })],
});
```

```js [Rollup]
// rollup.config.js
import kiln from "kiln/unplugin/rollup";
import esbuild from "rollup-plugin-esbuild";

export default {
  input: "src/main.tsx",
  output: { dir: "dist", format: "es" },
  plugins: [kiln(), esbuild({ jsx: "automatic", jsxImportSource: "kiln" })],
};
```

```ts [Rolldown]
// build.ts; JSX settings, including the import source, come from tsconfig.json
import kiln from "kiln/unplugin/rolldown";
import { build } from "rolldown";

await build({
  input: "src/main.tsx",
  output: { dir: "dist" },
  plugins: [kiln()],
});
```

```js [webpack]
// webpack.config.js
import kiln from "kiln/unplugin/webpack";

export default {
  entry: "./src/main.tsx",
  resolve: { extensions: [".tsx", ".ts", ".js"] },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: "swc-loader",
          options: {
            jsc: {
              parser: { syntax: "typescript", tsx: true },
              transform: { react: { runtime: "automatic", importSource: "kiln" } },
            },
          },
        },
      },
    ],
  },
  plugins: [kiln()],
};
```

```js [Rspack]
// rspack.config.js
import kiln from "kiln/unplugin/rspack";

export default {
  entry: "./src/main.tsx",
  resolve: { extensions: [".tsx", ".ts", ".js"] },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        loader: "builtin:swc-loader",
        options: {
          jsc: {
            parser: { syntax: "typescript", tsx: true },
            transform: { react: { runtime: "automatic", importSource: "kiln" } },
          },
        },
      },
    ],
  },
  plugins: [kiln()],
};
```

```ts [Rsbuild]
// rsbuild.config.ts
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import kiln from "kiln/unplugin/rsbuild";

export default defineConfig({
  plugins: [pluginReact({ swcReactOptions: { importSource: "kiln" } }), kiln()],
});
```

```ts [esbuild]
// build.ts
import { build } from "esbuild";
import kiln from "kiln/unplugin/esbuild";

await build({
  entryPoints: ["src/main.tsx"],
  outdir: "dist",
  bundle: true,
  format: "esm",
  jsx: "automatic",
  jsxImportSource: "kiln",
  plugins: [kiln()],
});
```

```ts [Bun]
// build.ts; Bun reads jsxImportSource from tsconfig.json
import kiln from "kiln/unplugin/bun";

await Bun.build({
  entrypoints: ["src/main.tsx"],
  outdir: "dist",
  plugins: [kiln()],
});
```

```ts [Farm]
// farm.config.ts
import { defineConfig } from "@farmfe/core";
import kiln from "kiln/unplugin/farm";

export default defineConfig({
  compilation: { input: { index: "./index.html" } },
  // Farm only strips types from TSX; the JSX transform comes from its React plugin.
  plugins: [["@farmfe/plugin-react", { runtime: "automatic", importSource: "kiln" }], kiln()],
});
```

```ts [unloader]
// render.ts; unloader runs hooks in array order and ignores `enforce`, so the compiler must come before oxc's JSX transform.
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import kiln from "kiln/unplugin/unloader";
import { register } from "unloader";
import oxc from "unplugin-oxc/unloader";

register({
  plugins: [kiln(), oxc({ transform: { jsx: { runtime: "automatic", importSource: "kiln" } } })],
});

// Modules imported after register() go through the plugins.
const { App } = await import("./src/App.tsx");
console.log(renderToString(createElement(App)));
```

```ts [Next.js]
// next.config.ts; works with webpack and Turbopack
import withKiln from "kiln/unplugin/next";

export default withKiln({});
```

:::

TanStack Router and TanStack Start use the Vite entry; place it after their plugin:

```ts
// vite.config.ts
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import kiln from "kiln/unplugin/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), kiln(), react({ jsxImportSource: "kiln" })],
});
```

## Options

| Option         | Default  | Meaning                                                                                            |
| -------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `importSource` | `"kiln"` | Module `css` and `styled` are imported from                                                        |
| `cssProp`      | `true`   | Compile `css={{...}}` on JSX elements                                                              |
| `extract`      | `false`  | Emit compiled rules as CSS instead of inserting them at runtime; see [Extraction](./extraction.md) |

`extract` takes `true`, or `{ split: "chunks" | "single" }`. What it produces depends on the bundler; [Extraction and CSS splitting](./extraction.md) covers each one.

## Bundler notes

- **webpack, Rspack and Rsbuild**: with `extract`, the project root must be a real path, not one under a symlink such as macOS's `/var` or `/tmp`. unplugin stores the CSS module under the root as given and the bundler resolves it to the real path, where it is missing. webpack and Rspack also need a CSS pipeline for the extracted modules, such as `css-loader` with `mini-css-extract-plugin`, or Rspack's `CssExtractRspackPlugin`; Rsbuild handles CSS itself.
- **Bun**: `Bun.build` reads `jsxImportSource` from `tsconfig.json`.
- **Farm** emits root-absolute asset URLs, so serve its output from `/`.
- **unloader** transforms modules for Node and produces no browser bundle; the example renders the app on the server and writes a static page.
- **Next.js**: Turbopack runs the compiler as a loader, which cannot add CSS modules, so `extract` only applies to webpack builds.
