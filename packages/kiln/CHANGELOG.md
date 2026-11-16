# Changelog

## Unreleased

### Breaking changes

- The compiler is now part of `kiln` instead of a separate `unplugin-kiln` package. Replace `unplugin-kiln` with `kiln/unplugin` and `unplugin-kiln/<bundler>` with `kiln/unplugin/<bundler>`, including the `unplugin-kiln/loader` path in a hand-written Turbopack rule with `kiln/unplugin/loader`, and remove `unplugin-kiln` from your dependencies. The compiler's dependencies are installed with `kiln`, and the runtime entries (`kiln`, `kiln/core`, `kiln/jsx-runtime`, `kiln/jsx-dev-runtime`) never import them.
- Rollup and Rolldown builds with `extract` now plan and emit kiln's own stylesheets, as Vite client builds already do: one per entry and lazily loaded chunk that adds rules, with only the rules it adds. Modules no longer import a `<source>.kiln.css` module, so a CSS plugin that collected those modules receives nothing; remove it. Each chunk loads its stylesheet itself before its code runs, and `.kiln/manifest.json` lists the stylesheets that load with each chunk, so the page can link an entry's. `extract: { split: "single" }` gives each entry one stylesheet instead. Output formats other than ES modules get one stylesheet per entry, which the page must link from `.kiln/manifest.<format>.json`, such as `.kiln/manifest.cjs.json`.

- `compileEntry` from `kiln/core` returns a list of entries, one per selector of a selector-list key, and keys each by its merge key (`"&:hover"` as `":hover"`).
- A key that a later input overrides now moves to where it was last set, so its rules come after the rules of keys it did not override. With a base of `{ "@media (min-width: 900px)": …, "@media (min-width: 600px)": … }` and an override of the 900px query, the override now beats the 600px query where both match, instead of losing to it. Class names come out in the new order too.
- Keys that select the same elements merge as one: `"&:hover"`, `" :hover"` and `":hover"` override each other instead of emitting rules that tie, and a selector-list key such as `":hover, :focus"` compiles to one rule per selector and merges per selector, so a later `":focus"` overrides only its part. Class names of selector-list keys change.
- Within one top-level key, only the last declaration of a property under one condition at one nesting depth is emitted, so `{ "@media print": { ":hover": { color: "red" }, "&:hover": { color: "blue" } } }` gives one rule instead of two that tie. The same property at different depths, such as `{ "@media print": { "&": { color: "red" }, color: "blue" } }`, still gives one rule per depth, and the deeper one wins by layer.

### Fixes

- webpack, Rspack and Rsbuild builds with `extract` keep the stylesheets kiln adds to a module when that module's `package.json` declares `"sideEffects": false`. They used to drop them as unused imports, leaving the page without kiln's rules.
