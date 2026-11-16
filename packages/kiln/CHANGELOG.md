# Changelog

## Unreleased

### Breaking changes

- The compiler is now part of `kiln` instead of a separate `unplugin-kiln` package. Replace `unplugin-kiln` with `kiln/unplugin` and `unplugin-kiln/<bundler>` with `kiln/unplugin/<bundler>`, including the `unplugin-kiln/loader` path in a hand-written Turbopack rule with `kiln/unplugin/loader`, and remove `unplugin-kiln` from your dependencies. The compiler's dependencies are installed with `kiln`, and the runtime entries (`kiln`, `kiln/core`, `kiln/jsx-runtime`, `kiln/jsx-dev-runtime`) never import them.
- Rollup and Rolldown builds with `extract` now plan and emit kiln's own stylesheets, as Vite client builds already do: one per entry and lazily loaded chunk that adds rules, with only the rules it adds. Modules no longer import a `<source>.kiln.css` module, so a CSS plugin that collected those modules receives nothing; remove it. Each chunk loads its stylesheet itself before its code runs, and `.kiln/manifest.json` lists the stylesheets that load with each chunk, so the page can link an entry's. `extract: { split: "single" }` gives each entry one stylesheet instead. Output formats other than ES modules get one stylesheet per entry, which the page must link from `.kiln/manifest.<format>.json`, such as `.kiln/manifest.cjs.json`.
- Production client builds of webpack, Rspack, Rsbuild and Next.js with webpack and `extract` now get kiln's planned stylesheets too: one sheet per entry and lazily loaded chunk group, with only the rules it adds, and no rule twice on a load path, where every source module's CSS used to be bundled per chunk with each shared rule repeated. kiln adds the rules to the stylesheets the CSS pipeline already emits, so webpack's and Rspack's own CSS loading, HTML plugins and Next.js serve them; kiln's rules no longer pass through the pipeline's loaders, such as PostCSS or Rsbuild's Lightning CSS transform, though its minimiser still runs. This needs `optimization.realContentHash`, which is on by default in production; without it kiln warns and keeps a CSS module per source module. `extract: { split: "single" }` gives each entry one stylesheet. Development builds, server builds and Next.js with Turbopack are unchanged.

### Fixes

- webpack, Rspack and Rsbuild builds with `extract` keep the stylesheets kiln adds to a module when that module's `package.json` declares `"sideEffects": false`. They used to drop them as unused imports, leaving the page without kiln's rules.
