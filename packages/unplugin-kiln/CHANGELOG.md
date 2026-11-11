# Changelog

## Unreleased

### Breaking changes

- Rollup and Rolldown builds with `extract` now plan and emit kiln's own stylesheets, as Vite client builds already do: one per entry and lazily loaded chunk that adds rules, with only the rules it adds. Modules no longer import a `<source>.kiln.css` module, so a CSS plugin that collected those modules receives nothing; remove it. Each chunk loads its stylesheet itself before its code runs, and `.kiln/manifest.json` lists the stylesheets that load with each chunk, so the page can link an entry's. `extract: { split: "single" }` gives each entry one stylesheet instead. Output formats other than ES modules get one stylesheet per entry, which the page must link from `.kiln/manifest.<format>.json`, such as `.kiln/manifest.cjs.json`.
