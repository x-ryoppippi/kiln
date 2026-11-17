---
title: Benchmarks
description: What each example ships with and without extract, measured by the repository's benchmark.
---

# Benchmarks

The repository's benchmark builds every example with and without `extract` and reports what each one ships. Run it from the repository root:

```sh
just bench                                        # sizes, reusing cached builds
just bench --routes --filter lazy-routes          # CSS loaded on first load and per navigation
just bench --routes --browser --filter lazy-routes # the same, measured in headless Chromium
just bench --time --runs 5                         # also the median time of uncached builds
just bench --json                                  # every field
```

The flags, and how each column is measured, are described in the [examples README](https://github.com/x-ryoppippi/nishiki/tree/main/examples#benchmark). [Benchmarks against other libraries](./library-benchmarks.md) build one of these apps with other styling libraries as well.

## Sizes

`just bench` output for commit `2d32e3b`, measured on 16 November 2026. Sizes are in KiB; the last column is the gzip difference `extract` makes against the runtime build. Next.js's extract build is compared with its webpack build, and server output is left out.

| Example         | Task                          | JS     | JS gzip | CSS   | CSS gzip | HTML gzip | Total gzip | Total brotli | extract vs runtime (gzip) |
| --------------- | ----------------------------- | ------ | ------- | ----- | -------- | --------- | ---------- | ------------ | ------------------------- |
| bun             | build                         | 213.80 | 66.87   | 0.00  | 0.00     | 0.16      | 67.03      | 58.09        |                           |
| bun             | build:extract                 | 212.70 | 66.56   | 0.88  | 0.46     | 0.18      | 67.20      | 58.26        | +0.17                     |
| esbuild         | build                         | 224.85 | 70.12   | 0.00  | 0.00     | 0.16      | 70.28      | 60.60        |                           |
| esbuild         | build:extract                 | 223.75 | 69.80   | 0.79  | 0.39     | 0.18      | 70.37      | 60.57        | +0.09                     |
| farm            | build                         | 227.20 | 72.67   | 0.00  | 0.00     | 2.86      | 75.53      | 65.00        |                           |
| farm            | build:extract                 | 226.11 | 72.35   | 0.76  | 0.44     | 2.90      | 75.69      | 65.12        | +0.16                     |
| lazy-routes     | build                         | 399.85 | 106.80  | 0.00  | 0.00     | 0.23      | 107.02     | 90.82        |                           |
| lazy-routes     | build:extract                 | 296.73 | 89.75   | 24.22 | 11.24    | 0.26      | 101.26     | 87.51        | -5.77                     |
| lazy-routes     | build:extract:single          | 296.49 | 89.64   | 14.26 | 4.98     | 0.26      | 94.89      | 81.98        | -12.14                    |
| lazy-routes     | build:rollup                  | 400.81 | 107.07  | 0.00  | 0.00     | 0.21      | 107.27     | 91.06        |                           |
| lazy-routes     | build:rollup:extract          | 299.06 | 90.72   | 24.22 | 11.24    | 0.24      | 102.20     | 88.57        | -5.07                     |
| lazy-routes     | build:rollup:extract:single   | 297.84 | 90.17   | 14.26 | 4.98     | 0.24      | 95.40      | 82.57        | -11.88                    |
| lazy-routes     | build:rolldown                | 406.66 | 106.20  | 0.00  | 0.00     | 0.21      | 106.41     | 90.08        |                           |
| lazy-routes     | build:rolldown:extract        | 304.65 | 89.79   | 24.22 | 11.24    | 0.24      | 101.27     | 87.64        | -5.14                     |
| lazy-routes     | build:rolldown:extract:single | 303.66 | 89.23   | 14.26 | 4.98     | 0.24      | 94.46      | 81.58        | -11.95                    |
| nextjs          | build                         | 562.23 | 172.61  | 0.00  | 0.00     | 0.00      | 172.61     | 149.15       |                           |
| nextjs          | build:webpack                 | 906.19 | 278.62  | 0.00  | 0.00     | 0.00      | 278.62     | 237.17       |                           |
| nextjs          | build:extract                 | 905.78 | 278.51  | 1.21  | 0.63     | 0.00      | 279.13     | 237.59       | +0.52                     |
| rolldown        | build                         | 222.70 | 69.10   | 0.00  | 0.00     | 0.16      | 69.26      | 59.52        |                           |
| rolldown        | build:extract                 | 221.96 | 68.97   | 0.60  | 0.38     | 0.20      | 69.54      | 59.78        | +0.28                     |
| rollup          | build                         | 224.39 | 70.16   | 0.00  | 0.00     | 0.16      | 70.32      | 60.74        |                           |
| rollup          | build:extract                 | 223.68 | 70.05   | 0.60  | 0.38     | 0.20      | 70.62      | 60.96        | +0.30                     |
| rsbuild         | build                         | 220.38 | 70.27   | 0.00  | 0.00     | 0.22      | 70.49      | 59.90        |                           |
| rsbuild         | build:extract                 | 219.29 | 69.95   | 0.59  | 0.37     | 0.25      | 70.58      | 59.95        | +0.09                     |
| rspack          | build                         | 220.40 | 70.00   | 0.00  | 0.00     | 0.18      | 70.18      | 59.65        |                           |
| rspack          | build:extract                 | 219.30 | 69.68   | 0.68  | 0.44     | 0.21      | 70.33      | 59.73        | +0.15                     |
| tanstack-router | build                         | 300.03 | 97.54   | 0.00  | 0.00     | 0.27      | 97.81      | 85.34        |                           |
| tanstack-router | build:extract                 | 297.74 | 96.81   | 1.45  | 1.10     | 0.29      | 98.20      | 85.66        | +0.39                     |
| tanstack-start  | build                         | 340.68 | 109.54  | 0.00  | 0.00     | 0.00      | 109.54     | 95.19        |                           |
| tanstack-start  | build:extract                 | 338.89 | 109.07  | 1.07  | 0.78     | 0.00      | 109.85     | 95.38        | +0.31                     |
| unloader        | build                         | 0.00   | 0.00    | 0.00  | 0.00     | 0.75      | 0.75       | 0.60         |                           |
| unloader        | build:extract                 | 0.00   | 0.00    | 0.81  | 0.39     | 0.49      | 0.88       | 0.73         | +0.13                     |
| vite            | build                         | 220.57 | 68.73   | 0.00  | 0.00     | 0.23      | 68.96      | 59.43        |                           |
| vite            | build:extract                 | 219.83 | 68.51   | 0.43  | 0.29     | 0.26      | 69.07      | 59.49        | +0.11                     |
| webpack         | build                         | 220.99 | 69.66   | 0.00  | 0.00     | 0.17      | 69.84      | 59.58        |                           |
| webpack         | build:extract                 | 219.89 | 69.34   | 0.81  | 0.39     | 0.20      | 69.93      | 59.62        | +0.09                     |

## Reading the numbers

- The small examples style a handful of elements, so extracting their rules adds a CSS response that costs slightly more than the JavaScript it saves: 0.1 to 0.5 KiB gzipped in total.
- `lazy-routes` styles eight lazily loaded routes and a twelve-component UI library. There, extraction removes about 100 KiB of JavaScript and saves 5 to 12 KiB gzipped in total.
- Its split builds ship more CSS in total than its single-sheet builds, because each lazily loaded route carries the shared rules it may need on its own. What matters for a visit is what each navigation fetches, which `--routes` and `--browser` report.
