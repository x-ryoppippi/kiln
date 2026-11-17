---
title: Bundler setup
description: Add the build-time compiler to Vite, Rollup, Rolldown, webpack, Rspack, Rsbuild, esbuild, Bun, Farm, unloader or Next.js.
---

# Bundler setup

The compiler is an [unplugin](https://unplugin.unjs.io) shipped in the same package as the runtime, so there is nothing else to install. It compiles the literal parts of `css(...)`, `styled(_, {...})` and `css={{...}}` with oxc at build time, using the same code as the runtime, so class names are identical either way. It runs on Node.js 24 or later.

Each bundler has its own entry, `@nishikijs/react/unplugin/<bundler>`. Two rules apply to all of them:

- Run the compiler **before the JSX transform**, which must use `@nishikijs/react` as its import source.
- Place it **after plugins that move code between modules**, such as TanStack Router's code splitting, so each module it compiles imports only the rules its own code uses.

Every bundler below has a runnable project in [`examples/`](https://github.com/x-ryoppippi/nishiki/tree/main/examples).

::: code-group

```ts [Vite]
// vite.config.ts
import react from "@vitejs/plugin-react";
import nishiki from "@nishikijs/react/unplugin/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [nishiki(), react({ jsxImportSource: "@nishikijs/react" })],
});
```

```js [Rollup]
// rollup.config.js
import nishiki from "@nishikijs/react/unplugin/rollup";
import esbuild from "rollup-plugin-esbuild";

export default {
  input: "src/main.tsx",
  output: { dir: "dist", format: "es" },
  plugins: [nishiki(), esbuild({ jsx: "automatic", jsxImportSource: "@nishikijs/react" })],
};
```

```ts [Rolldown]
// build.ts; JSX settings, including the import source, come from tsconfig.json
import nishiki from "@nishikijs/react/unplugin/rolldown";
import { build } from "rolldown";

await build({
  input: "src/main.tsx",
  output: { dir: "dist" },
  plugins: [nishiki()],
});
```

```js [webpack]
// webpack.config.js
import nishiki from "@nishikijs/react/unplugin/webpack";

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
              transform: { react: { runtime: "automatic", importSource: "@nishikijs/react" } },
            },
          },
        },
      },
    ],
  },
  plugins: [nishiki()],
};
```

```js [Rspack]
// rspack.config.js
import nishiki from "@nishikijs/react/unplugin/rspack";

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
            transform: { react: { runtime: "automatic", importSource: "@nishikijs/react" } },
          },
        },
      },
    ],
  },
  plugins: [nishiki()],
};
```

```ts [Rsbuild]
// rsbuild.config.ts
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import nishiki from "@nishikijs/react/unplugin/rsbuild";

export default defineConfig({
  plugins: [pluginReact({ swcReactOptions: { importSource: "@nishikijs/react" } }), nishiki()],
});
```

```ts [esbuild]
// build.ts
import { build } from "esbuild";
import nishiki from "@nishikijs/react/unplugin/esbuild";

await build({
  entryPoints: ["src/main.tsx"],
  outdir: "dist",
  bundle: true,
  format: "esm",
  jsx: "automatic",
  jsxImportSource: "@nishikijs/react",
  plugins: [nishiki()],
});
```

```ts [Bun]
// build.ts; Bun reads jsxImportSource from tsconfig.json
import nishiki from "@nishikijs/react/unplugin/bun";

await Bun.build({
  entrypoints: ["src/main.tsx"],
  outdir: "dist",
  plugins: [nishiki()],
});
```

```ts [Farm]
// farm.config.ts
import { defineConfig } from "@farmfe/core";
import nishiki from "@nishikijs/react/unplugin/farm";

export default defineConfig({
  compilation: { input: { index: "./index.html" } },
  // Farm only strips types from TSX; the JSX transform comes from its React plugin.
  plugins: [["@farmfe/plugin-react", { runtime: "automatic", importSource: "@nishikijs/react" }], nishiki()],
});
```

```ts [unloader]
// render.ts; unloader runs hooks in array order and ignores `enforce`, so the compiler must come before oxc's JSX transform.
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import nishiki from "@nishikijs/react/unplugin/unloader";
import { register } from "unloader";
import oxc from "unplugin-oxc/unloader";

register({
  plugins: [nishiki(), oxc({ transform: { jsx: { runtime: "automatic", importSource: "@nishikijs/react" } } })],
});

// Modules imported after register() go through the plugins.
const { App } = await import("./src/App.tsx");
console.log(renderToString(createElement(App)));
```

```ts [Next.js]
// next.config.ts; works with webpack and Turbopack
import withNishiki from "@nishikijs/react/unplugin/next";

export default withNishiki({});
```

:::

TanStack Router and TanStack Start use the Vite entry; place it after their plugin:

```ts
// vite.config.ts
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import nishiki from "@nishikijs/react/unplugin/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    nishiki(),
    react({ jsxImportSource: "@nishikijs/react" }),
  ],
});
```

## Options

| Option         | Default              | Meaning                                                                                            |
| -------------- | -------------------- | -------------------------------------------------------------------------------------------------- |
| `importSource` | `"@nishikijs/react"` | Module `css` and `styled` are imported from                                                        |
| `cssProp`      | `true`               | Compile `css={{...}}` on JSX elements                                                              |
| `extract`      | `false`              | Emit compiled rules as CSS instead of inserting them at runtime; see [Extraction](./extraction.md) |
| `conditions`   | `{}`                 | How conditions rank; see [Conditions](./how-it-works.md#conditions)                                |
| `runtime`      | `"allow"`            | Report modules that need the runtime compiler; see [Runtime fallbacks](#runtime-fallbacks)         |

`extract` takes `true`, or `{ split: "chunks" | "single" }`. What it produces depends on the bundler; [Extraction and CSS splitting](./extraction.md) covers each one.

## Runtime fallbacks

In client builds with Vite, Rollup, Rolldown, webpack, Rspack, Rsbuild, esbuild and Farm, the modules the compiler handles load `@nishikijs/react/lean`, which leaves out the compiler that turns a style object into rules. A module with a style the compiler cannot compile imports `@nishikijs/react/compiler` instead, which adds the full runtime to the client bundle once. Set `runtime` to `"warn"` to have the build name the first such construct in each module with its file, line and column, or to `"error"` to fail the build on it. Builds that load the full runtime anyway, such as Vite's dev server, server builds, Bun and Turbopack, never report it.

These constructs leave a style to the runtime compiler:

- A style that is not an object literal, such as a parameter, a prop, a call or a member: `css={props.css}`, `css(theme.button)`, `styled("a", makeStyles())`.
- A `styled` resolver that is not written in place, such as `styled("a", makeStyles)`, or that is async or a generator.
- A spread in a style object: `{ ...base, color: "red" }`.
- A computed key, a method or a setter in a style object: `{ [key]: 1 }`.
- A getter, or a `__proto__` whose value is not a literal, in a style object; a literal `__proto__` with a runtime value elsewhere in the object.
- A runtime value under a key that is not a CSS property, such as a selector, an at-rule or an element name: `{ ":hover": { color: tone } }`, `{ span: style }`.
- A third argument to `styled`.
- A `css` prop that is not an expression: `css="color: red"`.
- `configure()`, which ranks conditions at runtime; pass them to the compiler's `conditions` option instead.
- `css` or `styled` used as a value rather than called, such as `export { css }` or `list.map(css)`, and a namespace or default import of `@nishikijs/react`.
- An object with a `css` key, which may reach the `css` prop through a spread: `<div {...{ css: style }} />`.

A runtime value of a CSS property, such as `{ color: props.tone }`, does not: the compiler ranks its key at build time and leaves only the value to format. Nor does composing literals: the compiler follows the elements of a list, both branches of `?:`, the sides of `&&`, `||` and `??` that can be a style, and what a `styled` resolver written in place returns, its expression body or each `return` outside the functions it nests, and compiles every object literal it reaches by the rules above. `css={[base, active && { color: "red" }]}` compiles `{ color: "red" }` and leaves only `base` to these rules.

## Bundler notes

- **webpack, Rspack and Rsbuild**: with `extract`, the project root must be a real path, not one under a symlink such as macOS's `/var` or `/tmp`. unplugin stores the CSS module under the root as given and the bundler resolves it to the real path, where it is missing. webpack and Rspack also need a CSS pipeline that emits stylesheets, such as `css-loader` with `mini-css-extract-plugin`, or Rspack's `CssExtractRspackPlugin`, and `[contenthash]` in each stylesheet's name, without which the compiler warns and repeats shared rules in every stylesheet; Rsbuild handles CSS itself. See [Extraction](./extraction.md#webpack-rspack-rsbuild-and-next-js).
- **Bun**: `Bun.build` reads `jsxImportSource` from `tsconfig.json`.
- **Farm** emits root-absolute asset URLs, so serve its output from `/`.
- **unloader** transforms modules for Node and produces no browser bundle; the example renders the app on the server and writes a static page.
- **Next.js**: Turbopack runs the compiler as a loader, which cannot add CSS modules, so `extract` only applies to webpack builds.
