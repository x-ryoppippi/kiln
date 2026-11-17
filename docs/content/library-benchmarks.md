---
title: Benchmarks against other libraries
description: The same lazily routed app styled with nishiki, restyle, Emotion, styled-components, Linaria, vanilla-extract, StyleX, Panda CSS and Tailwind CSS, and what each ships and costs.
---

# Benchmarks against other libraries

The repository builds one app with nishiki and with eight other styling libraries and measures what each ships and what it costs in the browser. Run it from the repository root:

```sh
just bench-compare                                  # sizes and load paths, reusing cached builds
just bench-compare --browser                        # also unused CSS, style parity and timings in headless Chromium
just bench-compare --stress                         # also mounting and updating 1000 styled elements
just bench-compare --time --runs 5                  # also uncached build times
just bench-compare --sizes 32 --only nishiki --only stylex
just bench-compare --json results.json              # also every field, as JSON
```

The builds are `vp run` tasks of the packages in [`bench/compare`](https://github.com/x-ryoppippi/nishiki/tree/main/bench/compare), one per library, so they are cached like any other task. The browser is found as for [Benchmarks](./benchmarks.md).

## Results

Measured on 17 November 2026 on an Apple M3 Pro (11 cores, 36 GB) with macOS 27.2, Node.js 24.21 and headless Chrome 157, with `just bench-compare --browser --stress --time --runs 5`. nishiki is this repository's `packages/nishiki` at `c18ab6c`; the others are restyle 3.4.3, @emotion/react 11.14.0 and @emotion/styled 11.14.1, styled-components 6.6.0, @linaria/core and @linaria/react 8.3.0 with @wyw-in-js/vite 2.7.1, @vanilla-extract/css 1.21.3 with @vanilla-extract/vite-plugin 5.2.6, @stylexjs/stylex and @stylexjs/unplugin 0.19.2, @pandacss/dev 2.5.0, and tailwindcss and @tailwindcss/vite 4.3.5: each library's latest release at least two days old, as the workspace's `minimumReleaseAge` allows.

### 8 routes

Sizes in KiB; gzip unless stated. Each file is gzipped on its own, as it is served.

| Library            | JS    | CSS  | Total | Total (brotli) | Library runtime (min / gzip) | JS beyond baseline (min) | First load (JS + CSS + HTML) | Navigation, mean (worst) | CSS requests: first load / navigation (mean) |
| ------------------ | ----- | ---- | ----- | -------------- | ---------------------------- | ------------------------ | ---------------------------- | ------------------------ | -------------------------------------------- |
| unstyled           | 72.7  | 0.0  | 73.0  | 63.0           | 0                            | 0.0                      | 68.1                         | 0.8 (0.9)                | 0 / 0.0                                      |
| nishiki (runtime)  | 89.1  | 0.0  | 89.4  | 77.1           | 10.8 / 4.8                   | 45.2                     | 74.1                         | 2.3 (2.8)                | 0 / 0.0                                      |
| nishiki (compiled) | 107.3 | 0.0  | 107.5 | 91.5           | 2.3 / 1.1                    | 179.1                    | 72.9                         | 5.2 (6.0)                | 0 / 0.0                                      |
| nishiki (extract)  | 89.4  | 11.5 | 101.1 | 87.6           | 2.3 / 1.1                    | 55.9                     | 72.7                         | 4.0 (4.6)                | 1 / 1.0                                      |
| restyle            | 86.2  | 0.0  | 86.4  | 74.5           | 4.1 / 1.9                    | 38.6                     | 71.2                         | 2.3 (2.8)                | 0 / 0.0                                      |
| Emotion            | 94.1  | 0.0  | 94.3  | 81.2           | 24.3 / 9.9                   | 58.8                     | 79.1                         | 2.3 (2.8)                | 0 / 0.0                                      |
| styled-components  | 96.3  | 0.0  | 96.5  | 83.2           | 25.3 / 10.3                  | 66.9                     | 79.6                         | 2.5 (3.0)                | 0 / 0.0                                      |
| Linaria            | 80.0  | 13.7 | 94.0  | 80.7           | 5.5 / 2.8                    | 15.7                     | 72.9                         | 3.2 (3.8)                | 1 / 3.5                                      |
| vanilla-extract    | 75.8  | 11.6 | 87.7  | 74.8           | 0                            | 9.9                      | 70.0                         | 2.7 (3.3)                | 1 / 3.5                                      |
| StyleX             | 84.5  | 5.1  | 89.8  | 78.2           | 1.4 / 0.8                    | 27.5                     | 75.3                         | 2.4 (3.0)                | 1 / 0.0                                      |
| Panda CSS          | 91.1  | 4.0  | 95.5  | 81.9           | 18.1 / 6.6                   | 61.9                     | 79.7                         | 2.4 (2.9)                | 1 / 0.0                                      |
| Tailwind CSS       | 83.0  | 4.8  | 88.0  | 75.7           | 0                            | 30.3                     | 74.0                         | 2.1 (2.5)                | 1 / 0.0                                      |

In headless Chromium: unused CSS is the share of style rules a step added whose selector matches no rendered element; times are medians of 5 runs.

| Library            | Unused CSS rules: first load / navigation mean / visit-all | First load: rendered (ms) | First load: style + layout (ms) | Navigation mean: rendered (ms) | Navigation mean: style + layout (ms) | Style parity with nishiki (runtime) |
| ------------------ | ---------------------------------------------------------- | ------------------------- | ------------------------------- | ------------------------------ | ------------------------------------ | ----------------------------------- |
| unstyled           | - / - / -                                                  | 28                        | 5.7                             | 14                             | 0.4                                  | -                                   |
| nishiki (runtime)  | 3% / 2% / 2%                                               | 32                        | 9.9                             | 18                             | 1.7                                  | 100%                                |
| nishiki (compiled) | 3% / 2% / 2%                                               | 35                        | 13.9                            | 17                             | 2.0                                  | 100%                                |
| nishiki (extract)  | 3% / 3% / 3%                                               | 30                        | 8.2                             | 16                             | 1.5                                  | 100%                                |
| restyle            | 3% / 2% / 2%                                               | 32                        | 11.6                            | 15                             | 1.4                                  | 100%                                |
| Emotion            | 5% / 3% / 3%                                               | 35                        | 10.7                            | 14                             | 1.3                                  | 100%                                |
| styled-components  | 2% / 2% / 2%                                               | 31                        | 10.1                            | 15                             | 1.3                                  | 100%                                |
| Linaria            | 3% / 1% / 2%                                               | 32                        | 11.7                            | 16                             | 1.5                                  | 100%                                |
| vanilla-extract    | 3% / 1% / 2%                                               | 25                        | 7.9                             | 14                             | 1.5                                  | 100%                                |
| StyleX             | 76% / - / 1%                                               | 30                        | 8.7                             | 15                             | 1.5                                  | 100%                                |
| Panda CSS          | 70% / - / 2%                                               | 34                        | 15.6                            | 14                             | 1.4                                  | 100%                                |
| Tailwind CSS       | 76% / - / 3%                                               | 34                        | 8.2                             | 16                             | 1.8                                  | 100%                                |

Uncached `vp run` builds, median (range) of 5 runs, in seconds; the unstyled row is the floor that Vite+ and React set.

| Library            | Build            |
| ------------------ | ---------------- |
| unstyled           | 0.32 (0.31–0.35) |
| nishiki (runtime)  | 0.33 (0.32–0.36) |
| nishiki (compiled) | 0.34 (0.33–0.36) |
| nishiki (extract)  | 0.34 (0.34–0.38) |
| restyle            | 0.32 (0.31–0.33) |
| Emotion            | 0.32 (0.31–0.33) |
| styled-components  | 0.33 (0.32–0.35) |
| Linaria            | 0.50 (0.48–0.58) |
| vanilla-extract    | 0.55 (0.52–0.59) |
| StyleX             | 1.17 (1.13–1.24) |
| Panda CSS          | 0.38 (0.34–0.39) |
| Tailwind CSS       | 0.37 (0.34–0.38) |

### 32 routes

Sizes in KiB; gzip unless stated. Each file is gzipped on its own, as it is served.

| Library            | JS    | CSS  | Total | Total (brotli) | Library runtime (min / gzip) | JS beyond baseline (min) | First load (JS + CSS + HTML) | Navigation, mean (worst) | CSS requests: first load / navigation (mean) |
| ------------------ | ----- | ---- | ----- | -------------- | ---------------------------- | ------------------------ | ---------------------------- | ------------------------ | -------------------------------------------- |
| unstyled           | 90.3  | 0.0  | 90.5  | 78.2           | 0                            | 0.0                      | 69.3                         | 1.1 (1.3)                | 0 / 0.0                                      |
| nishiki (runtime)  | 137.0 | 0.0  | 137.2 | 118.6          | 10.8 / 4.8                   | 136.8                    | 75.3                         | 3.2 (3.8)                | 0 / 0.0                                      |
| nishiki (compiled) | 213.3 | 0.0  | 213.5 | 179.5          | 2.3 / 1.1                    | 656.6                    | 74.1                         | 6.9 (8.2)                | 0 / 0.0                                      |
| nishiki (extract)  | 147.4 | 50.2 | 197.8 | 172.7          | 2.3 / 1.1                    | 199.6                    | 74.2                         | 5.3 (6.2)                | 1 / 1.0                                      |
| restyle            | 134.1 | 0.0  | 134.3 | 115.9          | 4.1 / 1.9                    | 130.2                    | 72.4                         | 3.2 (3.8)                | 0 / 0.0                                      |
| Emotion            | 142.0 | 0.0  | 142.2 | 122.8          | 24.3 / 9.9                   | 150.4                    | 80.2                         | 3.2 (3.8)                | 0 / 0.0                                      |
| styled-components  | 148.7 | 0.0  | 149.0 | 128.4          | 25.3 / 10.3                  | 179.1                    | 80.8                         | 3.4 (4.0)                | 0 / 0.0                                      |
| Linaria            | 109.7 | 49.2 | 159.2 | 137.0          | 5.5 / 2.8                    | 43.2                     | 74.5                         | 4.4 (5.2)                | 1 / 6.1                                      |
| vanilla-extract    | 101.4 | 41.5 | 143.2 | 121.3          | 0                            | 37.2                     | 71.5                         | 3.8 (4.5)                | 1 / 6.1                                      |
| StyleX             | 130.1 | 12.4 | 142.8 | 125.8          | 1.4 / 0.8                    | 94.1                     | 83.8                         | 3.6 (4.4)                | 1 / 0.0                                      |
| Panda CSS          | 140.7 | 9.0  | 150.0 | 127.3          | 18.1 / 6.6                   | 181.4                    | 85.9                         | 3.3 (4.0)                | 1 / 0.0                                      |
| Tailwind CSS       | 127.8 | 9.8  | 137.9 | 117.6          | 0                            | 113.4                    | 80.3                         | 2.8 (3.4)                | 1 / 0.0                                      |

In headless Chromium: unused CSS is the share of style rules a step added whose selector matches no rendered element; times are medians of 5 runs.

| Library            | Unused CSS rules: first load / navigation mean / visit-all | First load: rendered (ms) | First load: style + layout (ms) | Navigation mean: rendered (ms) | Navigation mean: style + layout (ms) | Style parity with nishiki (runtime) |
| ------------------ | ---------------------------------------------------------- | ------------------------- | ------------------------------- | ------------------------------ | ------------------------------------ | ----------------------------------- |
| unstyled           | - / - / -                                                  | 30                        | 5.9                             | 14                             | 0.6                                  | -                                   |
| nishiki (runtime)  | 3% / 1% / 1%                                               | 38                        | 9.7                             | 20                             | 2.1                                  | 100%                                |
| nishiki (compiled) | 3% / 1% / 1%                                               | 31                        | 8.2                             | 19                             | 2.2                                  | 100%                                |
| nishiki (extract)  | 3% / 4% / 4%                                               | 33                        | 8.7                             | 16                             | 1.5                                  | 100%                                |
| restyle            | 3% / 1% / 1%                                               | 34                        | 10.9                            | 22                             | 1.7                                  | 100%                                |
| Emotion            | 5% / 2% / 2%                                               | 38                        | 12.3                            | 15                             | 1.2                                  | 100%                                |
| styled-components  | 2% / 1% / 1%                                               | 30                        | 8.5                             | 15                             | 1.1                                  | 100%                                |
| Linaria            | 3% / 1% / 1%                                               | 31                        | 8.5                             | 14                             | 1.1                                  | 100%                                |
| vanilla-extract    | 3% / 1% / 1%                                               | 29                        | 8.1                             | 16                             | 1.0                                  | 100%                                |
| StyleX             | 91% / - / 1%                                               | 28                        | 9.5                             | 15                             | 0.9                                  | 100%                                |
| Panda CSS          | 86% / - / 1%                                               | 36                        | 15.4                            | 15                             | 0.9                                  | 100%                                |
| Tailwind CSS       | 91% / - / 1%                                               | 34                        | 17.6                            | 15                             | 1.0                                  | 100%                                |

Uncached `vp run` builds, median (range) of 5 runs, in seconds; the unstyled row is the floor that Vite+ and React set.

| Library            | Build            |
| ------------------ | ---------------- |
| unstyled           | 0.34 (0.33–0.35) |
| nishiki (runtime)  | 0.35 (0.34–0.37) |
| nishiki (compiled) | 0.40 (0.38–0.47) |
| nishiki (extract)  | 0.41 (0.39–0.47) |
| restyle            | 0.33 (0.32–0.34) |
| Emotion            | 0.34 (0.33–0.34) |
| styled-components  | 0.35 (0.34–0.36) |
| Linaria            | 0.64 (0.62–0.80) |
| vanilla-extract    | 0.73 (0.68–0.75) |
| StyleX             | 3.23 (3.13–3.31) |
| Panda CSS          | 0.40 (0.39–0.51) |
| Tailwind CSS       | 0.39 (0.38–0.40) |

### Mounting and updating 1000 styled elements

In headless Chromium, median of 5 runs, in ms: the whole call with the style and layout it forces, and the style recalculation and layout within it.

| Library            | Mount: total | Mount: style + layout | Update: total | Update: style + layout |
| ------------------ | ------------ | --------------------- | ------------- | ---------------------- |
| unstyled           | 7.9          | 4.1                   | 0.5           | 0.0                    |
| nishiki (runtime)  | 61.3         | 7.7                   | 40.7          | 4.0                    |
| nishiki (compiled) | 24.7         | 7.5                   | 13.0          | 4.0                    |
| nishiki (extract)  | 18.5         | 7.2                   | 9.2           | 3.9                    |
| restyle            | 39.9         | 7.5                   | 23.3          | 4.0                    |
| Emotion            | 20.4         | 6.5                   | 8.8           | 3.2                    |
| styled-components  | 17.1         | 6.6                   | 6.0           | 3.1                    |
| Linaria            | 13.5         | 6.5                   | 6.3           | 4.4                    |
| vanilla-extract    | 11.4         | 6.7                   | 5.7           | 4.5                    |
| StyleX             | 12.2         | 6.7                   | 6.5           | 4.4                    |
| Panda CSS          | 13.5         | 6.8                   | 6.6           | 4.7                    |
| Tailwind CSS       | 11.0         | 6.9                   | 7.2           | 6.3                    |

## Reading the results

Where nishiki does well:

- **First load.** Every nishiki build fetches 72.7 to 75.3 KiB on first load, within 4 KiB of vanilla-extract and restyle, the smallest, and 5 to 12 KiB less than Emotion, styled-components and Panda at 32 routes. StyleX, Panda and Tailwind put every route's rules into one stylesheet, which the first page loads whole: 70 to 91% of the rules it adds style nothing on that page, and their first load grows with the app (Tailwind from 74.0 to 80.3 KiB, StyleX from 75.3 to 83.8 KiB between 8 and 32 routes), while nishiki's stays flat.
- **Unused CSS and requests.** nishiki's extracted builds load 3 to 4% of rules that match nothing on any step, about what the runtime libraries insert, and fetch one stylesheet per navigation. Linaria and vanilla-extract, which also split CSS by chunk, fetch 3.5 (8 routes) to 6.1 (32 routes) stylesheets per navigation, one per module.
- **Runtime size.** Of nishiki's full runtime, this app keeps 4.8 KiB gzipped after tree-shaking, and of the lean runtime that compiled modules import, 1.1 KiB, against about 10 KiB for Emotion and styled-components and 6.6 KiB for Panda's generated `styled-system`.
- **Build time.** The compiler adds at most 0.07 s over the unstyled build; StyleX's Babel-based plugin takes 1.2 s at 8 routes and 3.2 s at 32.

Where nishiki loses:

- **Total and navigation bytes when compiled.** Without `extract`, the compiler leaves compiled rules in the JavaScript in a form far larger than the style objects they come from: the compiled builds ship the most bytes in total (107.5 KiB at 8 routes, 213.5 KiB at 32) and the most per navigation (5.2 and 6.9 KiB, against 2.1 to 4.4 KiB for every other library). With `extract`, that data moves to CSS, but the split stylesheets repeat shared rules in each chunk that may load alone, and the total is still the largest after the compiled build (101.1 and 197.8 KiB), with 4.0 and 5.3 KiB per navigation. The runtime build is smaller than both at every size.
- **Rendering at runtime.** Mounting 1000 styled elements with a dynamic width takes 61 ms with nishiki's runtime and an update 41 ms, the slowest here: restyle takes 40 and 23 ms, Emotion 20 and 9 ms, and the libraries that compile styles 11 to 14 and 6 to 7 ms. Compiling (25 and 13 ms) and extracting (18 and 9 ms) remove most of the gap, since only the dynamic width is then resolved at render.
- **The smallest totals** belong to restyle at both sizes, then nishiki's runtime build (32 routes) or vanilla-extract and Tailwind (8 routes).

Timings within a few milliseconds of each other are noise: the first-load style and layout time of one build varies by several milliseconds from run to run.

## The app

Every library builds the same app: the `lazy-routes` fixture that [`scripts/gen-lazy-routes.ts`](https://github.com/x-ryoppippi/nishiki/blob/main/scripts/gen-lazy-routes.ts) generates for the repository's own benchmark, at 8 and 32 routes. An eager shell with a navigation and a home page loads each route with `React.lazy`; routes render 40 elements styled in place, drawn from a design system's declarations with seeded pseudo-random weights, plus components from a shared UI library (buttons, tables, tabs, a dialog, a form, ...), some of which only some routes import. The 32-route app adds a long tail of components that one or two routes use. Styles include `:hover`, `:focus`, `::backdrop` and `::placeholder`, attribute variants such as `[aria-current=page]`, `@media` queries, and a route-level override of the shared `Panel` component at a breakpoint of its own.

[`scripts/compare/emit.ts`](https://github.com/x-ryoppippi/nishiki/blob/main/scripts/compare/emit.ts) writes that app for each library from the generator's data, so every library gets the same elements, components, declarations, imports and code splitting, written the way its documentation writes them:

| Library            | Setup                                                                                              | A styled component                                         | An element styled in place                                                            | An override of a component  |
| ------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------- |
| unstyled           | `@vitejs/plugin-react`                                                                             | A component that renders the element                       | The element                                                                           | The component               |
| nishiki (runtime)  | `jsxImportSource: "@nishikijs/react"`                                                              | `styled(tag, styles)`                                      | `css` prop                                                                            | `css` prop                  |
| nishiki (compiled) | The same, plus `nishiki.vite()`                                                                    | the same                                                   | the same                                                                              | the same                    |
| nishiki (extract)  | The same, plus `nishiki.vite({ extract: true })`                                                   | the same                                                   | the same                                                                              | the same                    |
| restyle            | `jsxImportSource: "restyle"`                                                                       | `styled(tag, styles)`                                      | `css` prop                                                                            | `css` prop                  |
| Emotion            | `jsxImportSource: "@emotion/react"`                                                                | `styled(tag)(styles)`                                      | `css` prop                                                                            | `css` prop                  |
| styled-components  | None                                                                                               | `styled.tag(styles)`, object styles                        | A `styled.tag` component of its own (there is no `css` prop without the Babel plugin) | `styled(Component)(styles)` |
| Linaria            | `@wyw-in-js/vite`                                                                                  | `styled.tag` template literal                              | `css` template literal, as `className`                                                | `css`, as `className`       |
| vanilla-extract    | `@vanilla-extract/vite-plugin`                                                                     | `style()` in a `.css.ts` file beside the module            | `style()`, as `className`                                                             | `style()`, as `className`   |
| StyleX             | `@stylexjs/unplugin`, with `lightningcssOptions: { minify: true }`                                 | A component applying `stylex.props(styles.x, …, xstyle)`   | `stylex.props()`                                                                      | `xstyle` prop               |
| Panda CSS          | `@pandacss/dev/postcss`, `preflight: false`, `panda codegen` before the build                      | `styled(tag, { base })` from the generated `styled-system` | `css()`, as `className`                                                               | `css` prop                  |
| Tailwind CSS       | `@tailwindcss/vite`, `tailwindcss/theme.css` and `utilities.css` without preflight, `@source "./"` | A component joining its class names                        | Class names                                                                           | Class names                 |

Where a library cannot write a declaration as the fixture does, it writes the equivalent:

- styled-components, Emotion, Linaria, vanilla-extract, StyleX and Panda get values as CSS strings with units; nishiki and restyle get the fixture's numbers, which they turn into the same lengths.
- StyleX states each property once with its value per condition, so `:hover`, `:focus` and `@media` become conditions of the property they set, and `[data-*]` and `[aria-*]` selectors on the element become styles the component applies when its prop has that value. StyleX leaves out the `background`, `border` and `outline` shorthands, so they are written as the longhands they set. An override restates the conditions it keeps, since StyleX replaces a property as a whole.
- vanilla-extract takes pseudo-classes and pseudo-elements as keys, and attribute selectors under `selectors`.
- Tailwind uses a utility where one states exactly the declaration (`flex`, `p-4` for 16px, `font-semibold`, `border-b-2`, ...), an arbitrary value where the utility takes one (`text-[14px]`, `bg-[#f6f8fa]`), and an arbitrary property otherwise (`[grid-area:area12]`). `items-start` is `flex-start`, not `start`, so `start` is an arbitrary property. Tailwind's `hover:` applies only under `@media (hover: hover)`.
- None of the apps ships a reset: Panda's `preflight` and Tailwind's preflight are off, as no other library adds one.

Every app is built by Vite+ 1.6 (Vite on Rolldown) in production mode with `@vitejs/plugin-react` 6.2.1 and React 19.3.1, with each library's own Vite plugin and otherwise default options, a Vite manifest, and hidden source maps, which leave the emitted code unchanged.

## What is measured

- **JS, CSS and Total**: the gzip size (level 9) of every `.js` and `.css` file, plus `index.html`, each file compressed on its own as a server sends it. Brotli likewise.
- **Library runtime**: the minified bytes of the build that the source maps attribute to the styling library's packages (every package except React, React DOM and the scheduler) or to code it generates into the app (Panda's `styled-system`), and their gzip size compressed on their own, which is an estimate since in the build they share a stream with the rest. For nishiki's compiled builds this is the lean runtime that compiled modules import.
- **JS beyond baseline**: minified JS bytes over the unstyled app's, which adds the library's runtime and whatever its styles become in JavaScript: style objects, class name strings, or compiled rules.
- **First load**: what loading `/` fetches, following the manifest: the HTML, the entry and its static imports, and their CSS. **Navigation**: what loading one route fetches on top of the first load, as the mean (and worst) over the routes. **CSS requests**: stylesheets fetched on first load, and on a navigation on average. Libraries that insert rules at runtime fetch no CSS; their rules are in the JS.
- **Unused CSS** (`--browser`): the share of style rules a step added to the page, through stylesheets or runtime insertion, whose selector matches no rendered element once pseudo-classes such as `:hover` and pseudo-elements are ignored. Measured on first load, on each navigation (mean) and over a visit to every route.
- **Rendered** and **style + layout** (`--browser`): from navigation start, or the click on a link, to the frame after the last DOM change, and the main thread's style recalculation and layout time over the same step, from Chromium's `Performance.getMetrics`. The median over the runs, after a discarded warm-up run.
- **Style parity** (`--browser`): the share of computed values of 45 properties, over every element each step renders, that equal nishiki's runtime build's. It checks that every library renders the same page; the cases where they differ are listed below.
- **Mounting and updating** (`--stress`): a page of its own per library mounts 1000 elements and re-renders them five times with React's `flushSync`, forcing style and layout after each. Each element has static styles, one of three variants chosen by a `data-variant` attribute, and a width computed at render time, written as each library documents dynamic values: a value in the style object for nishiki, restyle, Emotion and styled-components, a custom property for Linaria (which generates it), vanilla-extract (`assignInlineVars`), StyleX (dynamic styles), Panda and Tailwind (`w-(--width)`). The wall time of each call and the style and layout time within it, median of the runs.
- **Build** (`--time`): uncached `vp run --no-cache` of each build, with the packages it depends on built beforehand and Panda's `codegen` left out; the unstyled row is the floor that Vite+, React and `vp run` set.

## Caveats

- **One app, one machine.** The fixture's style objects are generated, not taken from a real app. Its share of styles written in place, of shared components and of route-specific declarations decides how much each approach gains from deduplication, so another app can rank the libraries differently. Timings come from one machine and one browser.
- **Equivalent, not identical, source.** Each library's version of the app is written from the same data, but the way each library resolves conflicts differs, and so do a few computed values. Style parity with nishiki's runtime build is 99.89% or more for every library. The differences: where an object sets a shorthand after a longhand it covers (`paddingInline` then `padding`), styled-components, Emotion, Linaria and vanilla-extract follow the object's order, while nishiki, StyleX, Panda and Tailwind let the longhand win; where a route overrides the shared `Panel` at `(min-width: 48rem)` and the component's own `(min-width: 64rem)` also matches, nishiki ranks the wider breakpoint higher and keeps the component's padding, while the override wins in restyle, Emotion, styled-components, Linaria and vanilla-extract; Tailwind's `border-0` leaves a zero-width border `solid` rather than `none`. Every other computed value checked matches.
- **Recommended, not tuned, configuration.** Each library uses its documented Vite setup with default options, except where noted: StyleX's CSS is minified (its plugin appends rules after Vite has minified the sheet), and Panda's and Tailwind's resets are off. styled-components and Emotion run without their optional Babel plugins, which `@vitejs/plugin-react` 6 no longer runs; with them, styled-components would also compile the `css` prop. nishiki is measured without `extract: { split: "single" }`, which gives each entry one stylesheet and trades navigation requests for a larger first load.
- **Panda's `codegen`** runs before the build, as a dependency task, and is left out of its build time.
- **Library runtime** is attributed through source maps. Bytes a plugin inserts without mapping them, such as nishiki's compiled rules or vanilla-extract's class name modules, cannot be attributed to a package, which is why the table also gives the JS beyond the unstyled build.
- **Navigation** sizes come from Vite's manifest, from the first page to each route; they are what the browser fetches, not what it parses. Libraries that insert rules at runtime carry them in their JS, so their CSS columns are empty by design.
- **Server rendering** is not measured: every app renders on the client.
