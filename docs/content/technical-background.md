---
title: Technical background
description: Why precedence lives in cascade layers, how the compiler and the CSS splitting work, what they cost, and how they are verified.
---

# Technical background

This page explains the mechanisms behind [Why nishiki](./why.md): how precedence is encoded, what the compiler does, how stylesheets are split per route, and how all of it is checked. [How it works](./how-it-works.md) is the reference for the rules themselves.

## Cascade layers as the precedence model

Atomic CSS has a precedence problem by construction. Every rule is a single class, so two rules that set `padding` on one element have the same specificity, and the browser falls back to their order in the document. That order is whatever the page happened to load first: at runtime the order React first inserted the rules, which follows the visitor's history; with extracted CSS the order of the stylesheets, which changes when a lazily loaded route's sheet arrives. The usual ways out are to make specificity carry the precedence, by repeating or adding selectors, or to sort one global stylesheet at build time. The first leaks into every selector the user writes; the second rules out loading CSS per route.

[Cascade layers](https://developer.mozilla.org/docs/Web/CSS/@layer) give a third option. The browser compares layers before it compares specificity or source order, and their order is fixed by one `@layer` statement. nishiki puts every rule in the layer for its precedence, so the outcome is decided by the layer, not by when the rule arrived.

### What a layer name encodes

A rule's layer has two parts:

- **The rank of its conditions** is the top-level layer: `n0` for no condition, and up in base 36 from there. Ranks come from a closed order that is a function of the configuration, so the build, the runtime, server rendering and the client all compute the same rank for the same rule.
- **The depth of its property** nests it in sublayers named `a`. A layer's own rules beat the rules of its sublayers, so a broader property goes deeper and loses: `padding` sits in `n0.a.a.a`, `paddingLeft` in `n0`. Depths come from a table generated from the CSS specifications (`@webref/css` and `mdn-data`, through `scripts/gen-property-tiers.ts`), which also covers prefixed shorthands, `all`, and logical against physical longhands.

```css
/* no condition, a broad shorthand */
@layer n0.a.a.a {
  .ne962m0 {
    padding: 8px 16px;
  }
}
/* no condition, a longhand */
@layer n0 {
  .n1fxj9np {
    color: white;
  }
}
/* :hover, a shorthand */
@layer n1t.a.a {
  .n127hgyq:hover {
    background: #1158c7;
  }
}
```

Because depth is expressed by nesting rather than by its own top-level layers, only ranks ever need declaring.

### The order statement, and pruning it

The order of layers is fixed by the first time each one appears in the document, so the statement that declares them has to come first.

- **At runtime** the `<Styles>` component inserts the full order, `layerOrder()`, once: 543 B, 284 B gzipped, with the default configuration. React hoists it to the start of the head.
- **Planned stylesheets** declare only the layers the build uses, in the same relative order. The planner knows which sheets always load after another sheet, and those leave the statement out; each sheet that may load first declares it. Across the 8-, 32- and 128-route benchmark fixtures, the statements in all of a build's CSS come to 41 to 44 bytes.
- **CSS modules per source module**, for bundlers that do not plan sheets, declare a prefix of the full order, up to their highest rank. Any two prefixes are consistent with each other whichever loads first.

Pruning has one constraint. If a pruned statement comes first and a later statement declares a layer it lacks, that layer is appended after the ones already declared, above layers it should rank below. Pruned statements are therefore safe only when the full statement precedes them. React's hoisting puts the runtime's statement first; a template that links extracted stylesheets ahead of React's output must render `<style>{layerOrder()}</style>` at the top of the head.

### What layers do not decide

Layers order rules only where nishiki can rank them. Unlisted conditions, ties between rules under several conditions with the same highest one, class names joined from separate calls and properties outside the table are left to specificity and document order, and `!important` reverses layer precedence instead; [How it works](./how-it-works.md#not-ordered-by-layer) lists each one. Unlayered CSS beats every layer, so global and third-party styles that should lose to nishiki belong in a layer declared first.

## The compiler

The compiler is an [unplugin](https://unplugin.unjs.io) shipped in the same package. It parses each module with [oxc](https://oxc.rs), finds `css(...)`, `styled(_, {...})` and `css={{...}}`, and compiles their literal parts with the same core code the runtime uses, so class names are identical with and without it.

- **Hoisting.** A style with no runtime part becomes a module-level constant, shared by identical styles in the module. Every render passes the same object, which the runtime caches by identity, so a render does no style work for it.
- **Rule inputs, not rules.** Ranking a rule's conditions into a layer is the only part of a rule that needs the compiler; the rest is a function of the property, the value, the selector, the at-rules and the layer that the lean runtime already has. So the constant holds those inputs, leaving out whatever follows from the key, and the runtime formats the rules and hashes their class names once, when the module loads. A rule's text repeats its class name and layer, and class names are hashes that gzip cannot compress, so on the 32-route fixture this takes the JavaScript from 213.25 to 147.71 KiB gzipped.
- **Runtime values.** In `{ color: active ? a : b }`, the key is ranked at build time and the value is passed to a small helper that only formats the rule. Objects with a runtime part, such as a spread, keep their literal values compiled in place and merge the rest on each render.
- **A lean runtime.** In client builds, compiled modules import `@nishikijs/react/lean`, which leaves out the condition ranker: the property table, the default condition order, the code that builds a table from options and the selector classifier. With the default configuration the full runtime (`@nishikijs/react` and its JSX runtime, minified) is 5,453 B gzipped; the lean one is 1,867 B. A module that still hands the runtime a whole style object to compile imports `@nishikijs/react/compiler` as well. The compiler writes the lean imports into the module itself, with a `@jsxImportSource` pragma for the JSX transform that runs after it, so a bundler whose JSX transform honours the pragma need not resolve them for it; that brings the lean runtime to Bun and Next.js with Turbopack as well. Farm's React plugin ignores the pragma, so there the compiler's resolver points the JSX runtime imports of compiled modules at the lean one.
- **JavaScript semantics.** A compiled style object must behave as the object literal would. Runtime values are evaluated in written order, including ones a later key overrides; keys keep the order JavaScript gives them around spreads; a key written twice sits at its first position with its last value; a computed `["__proto__"]` is an ordinary key. Equivalence fixtures compare compiled and runtime output, class names and rule order included.
- **One configuration.** The `conditions` option reaches the runtime through a virtual module that every compiled module, and every module that leaves styles to runtime, imports before any style is compiled, so build-time and runtime ranks agree.

With `extract`, the compiled rules leave the JavaScript altogether, and so does whatever only adds class names: a literal `css` prop on an element becomes its `className`, and `css()` of literal styles becomes a constant. On the 128-route fixture that takes the Vite build's JavaScript from 372.01 to 290.76 KiB gzipped, though its split stylesheets add 198.04 KiB; see [Benchmarks](./benchmarks.md#reading-the-numbers).

## Splitting CSS per route

### The problem with CSS per module

Before the planner, each source module imported its own CSS module and the bundler concatenated them per chunk. Nothing knew which atomic rules a page already had, so shared rules were repeated in every chunk's stylesheet. On the 8-route fixture, a Vite navigation fetched 2 to 5 stylesheets, 2,271 B gzipped on average, and one load path carried 81 duplicate rules; webpack's build carried 120. Minifiers cannot remove them: Lightning CSS keeps duplicates in separate `@media` blocks, and esbuild keeps every duplicate.

### The planner

Splitting needs `extract` and applies to client builds of the bundlers below; development builds, other bundlers and Next.js with Turbopack keep a CSS module per source module or insert rules at runtime ([Extraction](./extraction.md#what-each-bundler-produces)). The planner (`split/plan.ts`) knows nothing about any bundler. Its input is the output chunk graph and the rules each module uses; its output is which rules each stylesheet holds.

- A **unit** is something the browser can load on its own: an entry or the target of a dynamic import. For webpack and Rspack, whose runtime loads a chunk group at once, units are chunk groups and the chunks several groups share.
- A unit's sheet holds the rules of its static closure, minus the rules **certainly loaded** whenever it arrives, minus the rules of sheets that always load with it. "Certainly loaded" is a greatest fixpoint over the unit's dynamic importers: a rule counts only if every path to the unit has loaded it.
- Rules are kept in cascade order, so a bundler that has to put several sheets in one file can merge them without reordering.

```text
entry ── Layout, Button        →  entry.css:    Layout + Button rules
 ├─ import() dashboard ── Chart, Button  →  dashboard.css: Chart rules only (Button is certainly loaded)
 └─ import() billing  ── Chart, Modal    →  billing.css:   Chart + Modal rules
```

`dashboard` and `billing` each carry `Chart`, since either may be the first to load it. That is the source of the visit-all cost below.

Each adapter hands the plan to the bundler's own machinery:

- **Vite** adds each sheet to the chunk's imported CSS, so Vite links it in the HTML, preloads it with the chunk and lists it in its manifest.
- **Rollup and Rolldown** emit the sheets themselves. In ES module output, each chunk with a sheet awaits it with a top-level `await` before its code runs, and a dynamic import of a string literal starts fetching the sheets in parallel with the chunk's JavaScript. A manifest lists each entry's sheets for the page to link. Other output formats cannot wait, so they get one sheet per entry.
- **webpack, Rspack, Rsbuild and Next.js with webpack** append each sheet to a stylesheet the CSS pipeline already emits, so the bundler's own CSS loading, HTML plugin and Next.js serve it, and none of nishiki's code runs in the browser for it.

On every one of these bundlers a page never misses a rule and never fetches a rule it is sure to have already. A navigation fetches one stylesheet for each newly loaded chunk that has rules. On the benchmark fixtures that is one per route; with webpack and Rspack, a chunk that `splitChunks` shares between routes has a sheet of its own, which the first navigation to load it also fetches. Planning takes about 1 ms for 8 routes, 7 ms for 128 and 106 ms for 512 on synthetic graphs.

### Why per-route beats one sheet

`just bench --routes --filter lazy-routes --filter lazy-routes-32 --filter lazy-routes-128` at commit `a0dd48e`, measured on 17 November 2026, Vite builds with `extract` (Rollup and Rolldown give identical CSS). Sizes are KiB gzipped. Unused counts nishiki rules on the first page whose class no JavaScript loaded with them mentions.

| Routes | `split`  | First load | Navigation, mean / worst | Requests per navigation | Unused on first load | Visit every route |
| ------ | -------- | ---------- | ------------------------ | ----------------------- | -------------------- | ----------------- |
| 8      | `chunks` | 1.59       | 1.23 / 1.38              | 1                       | 0%                   | 11.45             |
| 8      | `single` | 5.17       | 0 / 0                    | 0                       | 76%                  | 5.17              |
| 32     | `chunks` | 1.59       | 1.51 / 1.74              | 1                       | 0%                   | 49.84             |
| 32     | `single` | 12.66      | 0 / 0                    | 0                       | 91%                  | 12.66             |
| 128    | `chunks` | 1.59       | 1.52 / 1.80              | 1                       | 0%                   | 196.69            |
| 128    | `single` | 35.65      | 0 / 0                    | 0                       | 97%                  | 35.65             |

- **First load stays flat.** With splitting, the first page loads 1.59 KiB at every size, none of it unused. A single sheet grows with the application, and on the 128-route fixture 97% of what the first page loads is for pages it has not visited. That sheet is render-blocking.
- **A navigation costs one small request** on these fixtures, about 1.2 to 1.8 KiB, fetched alongside the route's own JavaScript.
- **Measured in a browser**, the same holds for rules actually rendered: on the 8-route fixture, headless Chromium found 0% of first-load rules unused with splitting and 76% with one sheet, for about 0.1 ms more style and layout work per navigation (7.3 against 7.1 ms on first load, 1.0 against 0.9 ms per navigation).
- **The trade-off is visit-all bytes.** A rule that many routes use is fetched again in each route's sheet that may load first, so visiting every route fetches 196.69 KiB against 35.65 KiB for one sheet on the 128-route fixture. nishiki accepts that cost because few visits touch every route, and because the alternative puts it on every visit's first page.

Moving widely shared rules into the entry's sheet would cut the repetition, and it was tried: every setting that saved navigation bytes raised first-load bytes by about as much, left 6% to 41% of first-load rules unused, cost up to 14% more build time on 128 routes, and in rare multi-entry graphs could reorder rules. It was not shipped. `extract: { split: "single" }` remains available for apps that prefer one sheet.

## How correctness is checked

Precedence and splitting fail silently, so neither is tested only against the code that implements it.

- **An independent cascade oracle** (`packages/nishiki/test/oracle/`) imports nothing from the core or the planner. It parses CSS text, orders layers and sublayers as CSS Cascade 5 does, evaluates media queries and selectors, computes specificity and expands shorthands from its own table. A separate specification states the documented semantics. A property test builds random compositions of styles, shuffles them, inserts copies at later positions, and requires the oracle's computed values to equal the specification's: 400 cases in CI, 5,000 when the layer ranking landed.
- **Planner fuzzing.** Random chunk graphs are walked along every navigation path, checking that every element loaded finds its rules, that no sheet repeats a rule already loaded on every path, and that no sheet without the layer statement arrives before one that declares it. The oracle's planner test runs 150 graphs in CI; the webpack chunk-group fuzz runs 2,000 per mode, and passed 30,000 locally.
- **A Chrome check.** `node scripts/oracle-chrome.ts` renders 20 oracle fixtures in headless Chrome at widths of 500, 700, 900 and 1,200 px and compares every covered longhand, set or not, with the oracle: 720 computed values, 0 differences. It is run by hand, not in CI.
- **Bundler tests** build real projects with every supported bundler and check one sheet per unit with exactly the rules it adds, rule order, the layer statement, and byte-identical rebuilds.
