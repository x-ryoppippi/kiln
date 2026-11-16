# Changelog

## Unreleased

### Breaking changes

- The compiler is now part of `kiln` instead of a separate `unplugin-kiln` package. Replace `unplugin-kiln` with `kiln/unplugin` and `unplugin-kiln/<bundler>` with `kiln/unplugin/<bundler>`, including the `unplugin-kiln/loader` path in a hand-written Turbopack rule with `kiln/unplugin/loader`, and remove `unplugin-kiln` from your dependencies. The compiler's dependencies are installed with `kiln`, and the runtime entries (`kiln`, `kiln/core`, `kiln/jsx-runtime`, `kiln/jsx-dev-runtime`) never import them.
- Rollup and Rolldown builds with `extract` now plan and emit kiln's own stylesheets, as Vite client builds already do: one per entry and lazily loaded chunk that adds rules, with only the rules it adds. Modules no longer import a `<source>.kiln.css` module, so a CSS plugin that collected those modules receives nothing; remove it. Each chunk loads its stylesheet itself before its code runs, and `.kiln/manifest.json` lists the stylesheets that load with each chunk, so the page can link an entry's. `extract: { split: "single" }` gives each entry one stylesheet instead. Output formats other than ES modules get one stylesheet per entry, which the page must link from `.kiln/manifest.<format>.json`, such as `.kiln/manifest.cjs.json`.
