---
title: Extraction and CSS splitting
description: How extract turns compiled rules into static stylesheets, split per chunk or one per entry.
---

# Extraction and CSS splitting

By default the compiler leaves compiled rules in the JavaScript, as the inputs the runtime formats them from, and they are inserted at runtime through React. With `extract`, they become static CSS instead: the browser can fetch and parse them in parallel with the script, and nothing formats or inserts them while rendering. Styles that are not literals keep working at runtime either way.

The JavaScript keeps each rule's class name, which costs more than its inputs, and split stylesheets repeat shared rules, so `extract` does not make an app smaller: on the benchmark's lazy-routes fixtures, split extraction ships more in total than leaving the rules to the runtime, and `split: "single"` ships less. [Compact class names](#compact-class-names) narrow the gap where an app can use them ([Benchmarks](./benchmarks.md#reading-the-numbers)).

With nothing left to insert, a `css` prop whose style is an object, or a list of them, made only of literal values, on an element such as `<div>` compiles to the class names it adds, after the element's own: `<p className="intro" css={{ margin: 0 }} />` becomes `<p className="intro ncpuxwg" />`, and a `className` expression is joined with them when the element renders. An object with a runtime value, such as `css={{ color: tone }}`, a component, which reads the `css` prop itself, and an element with a spread, which may carry a `className` or `css` of its own, keep the `css` prop. Likewise, a `css()` call of nothing but literal styles becomes a constant of its class names and a component that renders nothing, so it does no work when it runs.

```ts
nishiki({ extract: true }); // the same as { split: "chunks" }
nishiki({ extract: { split: "chunks" } }); // a stylesheet per entry and lazily loaded chunk
nishiki({ extract: { split: "single" } }); // one stylesheet per entry
nishiki({ extract: { classNames: "compact" } }); // short class names, for apps without server rendering
```

## What each bundler produces

| Bundler                                                     | `extract` produces                                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Vite (client build)                                         | Split stylesheets, linked through Vite's HTML, preloads and manifest                   |
| Rollup, Rolldown                                            | Split stylesheets that each chunk loads itself, plus a manifest                        |
| webpack, Rspack, Rsbuild, Next.js with webpack (production) | Split rules, added to the stylesheets the CSS pipeline emits and loaded by the bundler |
| Vite dev server, webpack-based development builds           | A CSS module per source module                                                         |
| esbuild, Bun, Farm, unloader                                | A CSS module per source module                                                         |
| Next.js with Turbopack                                      | Nothing: rules are inserted at runtime                                                 |

## Splitting by chunk

In a Vite client build, in Rollup and Rolldown builds, and in production client builds of webpack, Rspack, Rsbuild and Next.js with webpack, `extract: true` (or `{ split: "chunks" }`) gives each entry and each lazily loaded chunk that adds rules a sheet of its own. Each one holds every rule that chunk needs except those certainly loaded whenever it arrives, in the order they run. A page therefore never misses a rule and never fetches one it is sure to have already.

Two lazily loaded chunks that load together and share a component each still carry its rules, since either may also load alone. Splitting can therefore raise the total size of all stylesheets while lowering what each navigation fetches; [Benchmarks](./benchmarks.md) measures both.

`{ split: "single" }`, or Vite's `build.cssCodeSplit: false`, gives each entry one stylesheet with every rule it can reach instead.

## Compact class names

A class name is a hash of its rule (see [Class names](./how-it-works.md#class-names)), which gzip cannot compress, and with `extract` the JavaScript names a rule's class wherever it is used, and every stylesheet that holds the rule names it again. `{ classNames: "compact" }` lets a build that plans its stylesheets name its rules itself, once it knows them all: `_` and as few base-36 digits as it needs, the rules that most modules use first, so `_0` to `_z`, then `_00` to `_zz`, and so on. On the benchmark's lazy-routes apps, Vite builds ship 6.81 KiB less gzipped with 8 routes, 26.65 KiB less with 32 and 101.08 KiB less with 128, about three fifths of it from the JavaScript, and a navigation fetches about a fifth less CSS ([Benchmarks](./benchmarks.md#reading-the-numbers)).

- It applies where the compiler plans the stylesheets: Vite client builds, Rollup, Rolldown, and production client builds of webpack, Rspack and Rsbuild. Development builds and dev servers keep hashed names, and so do the bundlers that import a CSS module per source module.
- The compiler renames a rule's class in the build's stylesheets and in every string of its chunks that names it, after the chunks render and before the bundler names them after their content. What modules compile to does not change, so a persistent cache holds the same modules either way.
- Rules the runtime formats for runtime values that keep a rule each keep their hashed `n…` names, which never start with `_`, so they cannot take a compact name. The one rule per property that reads a [runtime value set as a custom property](./how-it-works.md#runtime-values) is extracted, and renamed, like any other.
- The names belong to one build, so every page that shows them has to come from that build. Leave it out of an app whose markup a server or another build renders: SSR, static rendering, React Server Components, or micro-frontends that put two builds on one page. A server build with the option fails when it compiles rules, such as Vite's SSR environment, `vite build --ssr`, or a webpack, Rspack or Rsbuild compiler for Node, and Next.js does not take it; a server build configured without it, such as a separate webpack config, cannot be told apart, so it is up to you.
- A compact name is short and does not look like nishiki's, so keep classes of your own that start with `_` and a few letters or digits off the page.

## Vite

- In chunk mode, `build.modulePreload: false` or `experimental.renderBuiltUrl` makes the compiler warn and fall back to one stylesheet per entry.
- These stylesheets do not pass through Vite's CSS pipeline, so PostCSS, `build.cssTarget` and Lightning CSS `targets` do not apply to their rules.
- Vite library mode keeps a CSS module per source module, which Vite bundles into `build.lib.cssFileName`.

## Rollup and Rolldown

The compiler loads the stylesheets itself, so no CSS plugin is needed.

- Each chunk with a stylesheet waits for it with a top-level `await` before its code runs, so a lazily loaded chunk resolves only once its rules are in.
- A dynamic import of a string literal also starts loading the stylesheets of the chunk it imports alongside its JavaScript, so they arrive in parallel. One with a computed specifier, such as a variable, starts fetching them only when the chunk starts to run.
- The few lines that load them are added as chunks render, so chunk cycles from `manualChunks` or Rolldown's groups, Rolldown's `strictExecutionOrder`, an `external` function and `renderChunk` minifiers leave them working.

### The manifest

`.nishiki/manifest.json` in the output lists each chunk with, in `css`, the stylesheets that load with it, those of the chunks it imports statically first. Link the entry's `css` files from the page, so they load with its script rather than after it:

```ts
import { writeFile } from "node:fs/promises";

import { MANIFEST, type ManifestChunk } from "@nishikijs/react/unplugin";
import nishiki from "@nishikijs/react/unplugin/rolldown";
import { build } from "rolldown";

const { output } = await build({
  input: "src/main.tsx",
  output: { dir: "dist" },
  plugins: [nishiki({ extract: true })],
});

const asset = output.find((file) => file.fileName === MANIFEST);
const manifest: Record<string, ManifestChunk> = asset?.type === "asset" ? JSON.parse(String(asset.source)) : {};
const links = (manifest["main.js"]?.css ?? []).map((file) => `<link rel="stylesheet" href="/${file}" />`).join("");

await writeFile(
  "dist/index.html",
  `<!doctype html><html><head>${links}</head><body><div id="root"></div><script type="module" src="/main.js"></script></body></html>`,
);
```

A template like this links the stylesheets before anything React renders, so if some styles are left to runtime, also put `<style>${layerOrder()}</style>` (from `@nishikijs/react`) at the top of the head; otherwise a runtime rule in a layer that no extracted sheet declares ranks above every extracted rule. See [Cascade layers](./how-it-works.md#cascade-layers).

From the `lazy-routes` example, trimmed to one route:

```json
{
  "main.js": {
    "file": "main.js",
    "css": ["assets/nishiki-n5-DLwm4.css"],
    "dynamicImports": ["dashboard-BlDgcZMj.js"],
    "isEntry": true
  },
  "dashboard-BlDgcZMj.js": {
    "file": "dashboard-BlDgcZMj.js",
    "css": ["assets/nishiki-n5-DLwm4.css", "assets/nishiki-B4NQ1rsW.css"],
    "imports": ["main.js", "Chart-B4868fm6.js"],
    "isDynamicEntry": true
  }
}
```

Output that is not an ES module cannot wait for its stylesheets, so it gets one stylesheet per entry, which the page must link from `.nishiki/manifest.<format>.json`, such as `.nishiki/manifest.cjs.json`; in chunk mode the compiler warns about this.

Outputs of different formats can share a directory, but outputs of one format each need their own. The build fails when one of its outputs would overwrite another's manifest, but it cannot see a separate build that writes to the same directory.

## webpack, Rspack, Rsbuild and Next.js

The compiler adds its rules to the stylesheets your CSS pipeline already emits, so the bundler's own CSS chunk loading, its HTML plugin and Next.js load them, and none of the compiler's code runs in the browser.

- This needs a pipeline that emits stylesheets: mini-css-extract-plugin, Rspack's `CssExtractRspackPlugin` or native CSS. The build fails when the pipeline keeps the compiler's CSS in JavaScript anyway, as a rule of its own with `style-loader` would, or emits no stylesheet for a chunk that a sheet must go in.
- Each chunk group gets one sheet, in a chunk that only it loads. A chunk that several groups share, such as one `splitChunks` made, gets the rules of its own modules that are not certainly loaded when it arrives. A navigation therefore fetches one stylesheet for each chunk it loads that has CSS, which with the default `splitChunks` is one per lazily loaded route. A stylesheet the compiler leaves empty is dropped if only a page links it, as with Next.js's CSS chunking.
- The rules skip the pipeline's loaders, such as PostCSS or Rsbuild's Lightning CSS transform, but its minimiser still runs over them.
- The pipeline names a stylesheet before the compiler adds to it, so `optimization.realContentHash`, on by default in production, has to give each its final name. Without it the compiler warns and keeps a CSS module per source module. `realContentHash` renames only a stylesheet with `[contenthash]` in its name; where one has none, the compiler warns and gives each stylesheet the rules of its own CSS modules, which repeats shared rules.
- With `{ split: "single" }`, each entry gets one stylesheet in a chunk that only it loads; where the pipeline emits no stylesheet for any such chunk, the compiler warns and splits by chunk instead. A lazily loaded chunk that imported the compiler's CSS still fetches its stylesheet, now without those rules.
- Next.js with webpack renders an App Router page inside the layouts and templates of its segment and those above it, so a page's stylesheet leaves out what they already load. `global-error` and `global-not-found` replace the root layout, so their stylesheets keep every rule they need.
- Development builds, builds whose CSS pipeline emits no stylesheets (such as `style-loader` or a server build that keeps only the exports of CSS) and builds for a target other than the web keep a CSS module per source module.

```js
// webpack.config.js
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import nishiki from "@nishikijs/react/unplugin/webpack";

export default {
  // ...
  module: {
    rules: [
      // ...
      { test: /\.css$/, use: [MiniCssExtractPlugin.loader, "css-loader"] },
    ],
  },
  plugins: [nishiki({ extract: true }), new MiniCssExtractPlugin({ filename: "[name].[contenthash:8].css" })],
};
```

## Limitations

- **Turbopack**: Next.js with Turbopack ignores `extract` and inserts rules at runtime, because Turbopack runs the compiler as a loader, which cannot add CSS modules.
- **Splitting** is planned only by Vite client builds, Rollup, Rolldown and production client builds of webpack, Rspack, Rsbuild and Next.js with webpack. Other bundlers import a CSS module per source module and split or merge them with their own CSS handling.
- **CSS pipelines** do not process the rules in Vite's split stylesheets at all, and only the minimiser runs over the ones added to webpack's and Rspack's.
- **Compact class names** apply only where the compiler plans the stylesheets, and only to apps whose markup no server or other build renders (see [Compact class names](#compact-class-names)).
- **Symlinked roots**: with webpack, Rspack and Rsbuild, the project root must be a real path (see [Bundler notes](./compiler.md#bundler-notes)).
