# Examples

Each example renders a small React app styled with kiln: the `css` prop, `styled()` with a hover state, and styles that depend on state or are computed at runtime. Every one compiles its styles at build time with `unplugin-kiln`, and most also have a `build:extract` task that turns on `extract: true` to move static rules into a CSS file.

| Example                                | Bundler / framework                        | Plugin entry              | `build:extract`        |
| -------------------------------------- | ------------------------------------------ | ------------------------- | ---------------------- |
| [`vite`](./vite)                       | Vite+                                      | `unplugin-kiln` (`.vite`) | yes                    |
| [`nextjs`](./nextjs)                   | Next.js App Router, Turbopack and webpack  | `unplugin-kiln/next`      | webpack only           |
| [`tanstack-router`](./tanstack-router) | Vite+ with TanStack Router file routes     | `unplugin-kiln` (`.vite`) | yes                    |
| [`tanstack-start`](./tanstack-start)   | TanStack Start (SSR) on Vite+              | `unplugin-kiln` (`.vite`) | yes                    |
| [`webpack`](./webpack)                 | webpack 5                                  | `unplugin-kiln/webpack`   | yes                    |
| [`rspack`](./rspack)                   | Rspack                                     | `unplugin-kiln/rspack`    | yes                    |
| [`esbuild`](./esbuild)                 | esbuild                                    | `unplugin-kiln/esbuild`   | yes                    |
| [`rolldown`](./rolldown)               | Rolldown                                   | `unplugin-kiln/rolldown`  | yes                    |
| [`bun`](./bun)                         | `Bun.build`                                | `unplugin-kiln/bun`       | yes                    |
| [`rollup`](./rollup)                   | Rollup 4                                   | `unplugin-kiln/rollup`    | yes                    |
| [`farm`](./farm)                       | Farm                                       | `unplugin-kiln/farm`      | yes                    |
| [`rsbuild`](./rsbuild)                 | Rsbuild                                    | `unplugin-kiln/rsbuild`   | yes                    |
| [`unloader`](./unloader)               | unloader (Node.js loader), server-rendered | `unplugin-kiln/unloader`  | yes                    |
| [`lazy-routes`](./lazy-routes)         | Vite+, Rollup and Rolldown, 8 lazy routes  | all three                 | yes, also single-sheet |

## Running

Install the workspace first with `pnpm install`. The builds are Vite+ tasks, defined in each example's `vite.config.ts`: each one builds the workspace packages it imports first, and `vp run` caches them and replays their output when nothing they read has changed. In an example directory:

```sh
pnpm exec vp run build          # compile styles, insert rules at runtime
pnpm exec vp run build:extract  # also emit static rules as CSS
```

The static examples (`vite`, `tanstack-router`, `lazy-routes`, `webpack`, `rspack`, `esbuild`, `rolldown`, `bun`, `rollup`, `farm`, `rsbuild`) write `dist/`, or `dist-extract/` for the extract build; serve either directory with any static file server. `tanstack-router` uses browser history, so its server must fall back to `index.html` for `/about`; `pnpm run preview` does. The Vite+ based ones can also run `pnpm run dev` and `pnpm run preview`, which stay package.json scripts because servers are never cached.

Next.js:

```sh
pnpm exec vp run build          # Turbopack
pnpm exec vp run build:webpack  # webpack
pnpm exec vp run build:extract  # webpack with extract: true
pnpm run start
```

Turbopack runs kiln as a loader, which cannot add CSS modules, so `extract` only applies to webpack builds.

Farm emits root-absolute asset URLs, so serve its output from `/`.

The `unloader` example renders the app in Node through unloader's loader hooks and writes a static page with no hydration script: unloader transforms modules for Node and produces no browser bundle. Without `extract`, the rules sit in a `<style>` element in the HTML.

With webpack, Rspack and Rsbuild, `extract` fails when the project root sits under a symlink, such as macOS's `/tmp`, which links to `/private/tmp`: unplugin's virtual modules are not found there. Use the real path instead.

TanStack Start writes `dist/client` and `dist/server` for both builds; serve the result with `pnpm run preview`.

`lazy-routes` measures how extracted CSS is split across lazily loaded chunks, so its sources are generated: a shell and home page, 8 routes and a 12-component UI library, written by `pnpm exec node scripts/gen-lazy-routes.ts` from a fixed seed. `ROUTES` and `ELEMENTS` scale it up; commit only the 8-route default. Its `build:extract` task gives each lazy route one stylesheet with only the rules that route adds, and its `build:extract:single` task sets `extract: { split: "single" }` for one stylesheet and writes `dist-extract-single/`. `build:rollup` and `build:rolldown` build the same app with Rollup and Rolldown, each with `:extract` and `:extract:single` variants, into `dist-rollup`, `dist-rollup-extract` and so on; their page links the entry's stylesheets from kiln's `.kiln/manifest.json`.

The `bun` example needs [Bun](https://bun.sh) on `PATH`.

## Benchmark

From the repository root, `pnpm exec vp run bench` builds every example with and without `extract` and prints a Markdown table of what each one ships: JS and CSS raw and gzipped, HTML gzipped, the gzip and brotli totals, and the gzip difference `extract` makes. Next.js's extract build is compared with its webpack build, and server output is left out.

`--routes` adds columns read from the manifest of builds that write one, Vite's `.vite/manifest.json` (`lazy-routes` and `tanstack-router`) or the `.kiln/manifest.json` that `extract` writes with Rollup and Rolldown (`rollup`, `rolldown` and `lazy-routes`' `build:rollup:*` and `build:rolldown:*`), and `-` for the rest: the CSS gzip loaded on first load, the CSS a navigation to each lazily loaded chunk fetches on top of what is already loaded (mean and worst gzip, and requests), all reachable CSS, and the most duplicate copies of a kiln rule among the files loaded on one path, within one file included. Each CSS file is a separate response, so these sizes add up each file's own gzip size. Every load path is walked, and linked stylesheets are assumed to be under the default base, `/`. Splitting can raise the summed CSS total while lowering what each load fetches.

It also reports unused CSS, the share of kiln rules, and of their bytes, that a step loads although the page it renders does not use them: on first load, the mean and worst over navigations that load any kiln rule, and over everything a visit to every route loads. Here a rule counts as used when the JS chunks loaded with it mention its class (the "static" method), which also counts rules for elements a route never renders. A rule's bytes are its own `selector{declarations}` text; wrapping `@layer` and `@media` preludes are not counted.

The manifest walk treats every dynamic import as a navigation and only the entry's static imports as first load. It cannot know which lazy chunks a router fetches for a URL: `tanstack-router` loads its index route's chunk with the first page and fetches the `team` error component only on an error, yet the walk counts both as navigations. `--browser` measures what loading the app actually fetches.

`--browser` loads each build of an example that has a build with a manifest, including that example's runtime builds as a baseline, in headless Chrome or Chromium, served from a local static server that gzips at level 9 and falls back to `index.html` for extensionless paths. Each run uses a fresh browser context: it loads `/`, then clicks every same-origin link on that page in document order, waiting for each step to settle (nothing in flight and no DOM change for 500 ms). Per step it records the CSS gzip bytes and requests the server sent, the time from navigation start or the click to the frame after the last DOM change, and style recalculation plus layout time from Chromium's `Performance.getMetrics` counters, which cover the whole main thread and need no trace parsing. It also reports the same unused shares as above (the "browser" method), with a rule used when its class is on an element the page renders (`checkVisibility()`), so the rules of a closed `<dialog>`, such as the one `lazy-routes` puts on its billing and inbox pages, count as unused. Rules come from the CSSOM, so runtime-inserted rules count as well as sheets, and a rule's bytes are as the CSSOM serialises it: compare shares, not bytes, with the static method. The table shows first load and the mean over navigations, with times as the median and range over the runs; `--json` has every step of every run. Runs go round the builds in turn, so a machine that slows down during the benchmark does not favour one build, but the range is within one invocation and the order of builds whose ranges overlap can change between invocations. The browser is driven over the DevTools Protocol with Node's built-in WebSocket, so nothing is downloaded: it is taken from `CHROME_PATH`, then `chromium`, `chromium-browser`, `google-chrome-stable`, `google-chrome` or `chrome` on `PATH`, then the usual install location on macOS and Windows. A `CHROME_PATH` that does not exist is an error; without any browser, `--browser` prints a message and skips its columns. With Nix on Linux, `CHROME_PATH=$(nix build --no-link --print-out-paths nixpkgs#chromium)/bin/chromium` provides one.

`--time` adds the median, with the fastest and slowest, of uncached builds of each task, timed in turn round the tasks. The packages a task depends on are built once beforehand and left out of the timing, which still includes `vp run`'s own start-up.

`--runs` sets the number of runs for `--time` (default 3) and `--browser` (default 5). `--json` prints every field, whichever flags are given.

```sh
pnpm exec vp run bench                          # sizes, reusing cached builds
pnpm exec vp run bench --routes --filter lazy-routes
pnpm exec vp run bench --routes --browser --filter lazy-routes --filter tanstack-router
pnpm exec vp run bench --time --runs 5          # also the median time of uncached builds
pnpm exec vp run bench --filter vite --filter webpack
pnpm exec vp run bench --json
```
