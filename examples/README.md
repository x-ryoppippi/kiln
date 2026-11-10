# Examples

Each example renders a small React app styled with kiln: the `css` prop, `styled()` with a hover state, and styles that depend on state or are computed at runtime. Every one compiles its styles at build time with `unplugin-kiln`, and most also have a `build:extract` task that turns on `extract: true` to move static rules into a CSS file.

| Example                                | Bundler / framework                       | Plugin entry              | `build:extract`        |
| -------------------------------------- | ----------------------------------------- | ------------------------- | ---------------------- |
| [`vite`](./vite)                       | Vite+                                     | `unplugin-kiln` (`.vite`) | yes                    |
| [`nextjs`](./nextjs)                   | Next.js App Router, Turbopack and webpack | `unplugin-kiln/next`      | webpack only           |
| [`tanstack-router`](./tanstack-router) | Vite+ with TanStack Router file routes    | `unplugin-kiln` (`.vite`) | yes                    |
| [`tanstack-start`](./tanstack-start)   | TanStack Start (SSR) on Vite+             | `unplugin-kiln` (`.vite`) | yes                    |
| [`webpack`](./webpack)                 | webpack 5                                 | `unplugin-kiln/webpack`   | yes                    |
| [`rspack`](./rspack)                   | Rspack                                    | `unplugin-kiln/rspack`    | yes                    |
| [`esbuild`](./esbuild)                 | esbuild                                   | `unplugin-kiln/esbuild`   | yes                    |
| [`rolldown`](./rolldown)               | Rolldown                                  | `unplugin-kiln/rolldown`  | yes, with a CSS plugin |
| [`bun`](./bun)                         | `Bun.build`                               | `unplugin-kiln/bun`       | yes                    |

## Running

Install the workspace first with `pnpm install`. The builds are Vite+ tasks, defined in each example's `vite.config.ts`: each one builds the workspace packages it imports first, and `vp run` caches them and replays their output when nothing they read has changed. In an example directory:

```sh
pnpm exec vp run build          # compile styles, insert rules at runtime
pnpm exec vp run build:extract  # also emit static rules as CSS
```

The static examples (`vite`, `tanstack-router`, `webpack`, `rspack`, `esbuild`, `rolldown`, `bun`) write `dist/`, or `dist-extract/` for the extract build; serve either directory with any static file server. `tanstack-router` uses browser history, so its server must fall back to `index.html` for `/about`; `pnpm run preview` does. The Vite+ based ones can also run `pnpm run dev` and `pnpm run preview`, which stay package.json scripts because servers are never cached.

Next.js:

```sh
pnpm exec vp run build          # Turbopack
pnpm exec vp run build:webpack  # webpack
pnpm exec vp run build:extract  # webpack with extract: true
pnpm run start
```

Turbopack runs kiln as a loader, which cannot add CSS modules, so `extract` only applies to webpack builds.

TanStack Start writes `dist/client` and `dist/server` for both builds; serve the result with `pnpm run preview`.

The `bun` example needs [Bun](https://bun.sh) on `PATH`.

## Benchmark

From the repository root, `pnpm exec vp run bench` builds every example with and without `extract` and prints a Markdown table of the client JS and CSS each one ships, raw, gzip and brotli, with the gzip difference `extract` makes. Next.js's extract build is compared with its webpack build, and server output is left out.

```sh
pnpm exec vp run bench                          # sizes, reusing cached builds
pnpm exec vp run bench --time --runs 5          # also the median time of uncached builds
pnpm exec vp run bench --filter vite --filter webpack
pnpm exec vp run bench --json
```
