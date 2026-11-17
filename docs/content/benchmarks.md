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

`just bench` output for commit `33b0d5c`, measured on 17 November 2026. Sizes are in KiB; the last column is the gzip difference `extract` makes against the runtime build. Next.js's extract build is compared with its webpack build, and server output is left out.

| Example         | Task                          | JS      | JS gzip | CSS    | CSS gzip | HTML gzip | Total gzip | Total brotli | extract vs runtime (gzip) |
| --------------- | ----------------------------- | ------- | ------- | ------ | -------- | --------- | ---------- | ------------ | ------------------------- |
| bun             | build                         | 212.14  | 66.42   | 0.00   | 0.00     | 0.16      | 66.58      | 57.60        |                           |
| bun             | build:extract                 | 210.90  | 65.90   | 1.39   | 0.63     | 0.18      | 66.71      | 57.66        | +0.13                     |
| esbuild         | build                         | 223.23  | 69.67   | 0.00   | 0.00     | 0.16      | 69.83      | 60.23        |                           |
| esbuild         | build:extract                 | 222.01  | 69.16   | 1.30   | 0.56     | 0.18      | 69.90      | 60.21        | +0.06                     |
| farm            | build                         | 225.94  | 72.32   | 0.00   | 0.00     | 2.87      | 75.19      | 64.69        |                           |
| farm            | build:extract                 | 224.66  | 71.77   | 1.21   | 0.60     | 2.90      | 75.27      | 64.72        | +0.08                     |
| lazy-routes     | build                         | 308.88  | 90.06   | 0.00   | 0.00     | 0.23      | 90.28      | 77.65        |                           |
| lazy-routes     | build:extract                 | 262.98  | 83.87   | 26.39  | 11.54    | 0.27      | 95.67      | 83.39        | +5.39                     |
| lazy-routes     | build:extract:single          | 262.72  | 83.78   | 15.21  | 5.19     | 0.26      | 89.23      | 77.60        | -1.05                     |
| lazy-routes     | build:extract:compact         | 253.14  | 79.61   | 22.90  | 9.03     | 0.27      | 88.90      | 76.51        | -1.38                     |
| lazy-routes     | build:rollup                  | 309.62  | 90.39   | 0.00   | 0.00     | 0.21      | 90.60      | 77.98        |                           |
| lazy-routes     | build:rollup:extract          | 265.15  | 84.77   | 26.39  | 11.54    | 0.24      | 96.55      | 84.35        | +5.95                     |
| lazy-routes     | build:rollup:extract:single   | 263.81  | 84.18   | 15.21  | 5.19     | 0.25      | 89.61      | 78.07        | -0.99                     |
| lazy-routes     | build:rolldown                | 315.75  | 89.43   | 0.00   | 0.00     | 0.21      | 89.64      | 77.03        |                           |
| lazy-routes     | build:rolldown:extract        | 270.95  | 83.90   | 26.39  | 11.54    | 0.24      | 95.68      | 83.34        | +6.04                     |
| lazy-routes     | build:rolldown:extract:single | 269.94  | 83.34   | 15.21  | 5.19     | 0.25      | 88.78      | 77.23        | -0.86                     |
| lazy-routes     | build:webpack                 | 322.92  | 92.37   | 0.00   | 0.00     | 0.19      | 92.55      | 78.85        |                           |
| lazy-routes     | build:webpack:extract         | 273.98  | 87.32   | 26.39  | 11.53    | 0.21      | 99.06      | 85.58        | +6.51                     |
| lazy-routes     | build:webpack:extract:single  | 273.98  | 87.28   | 15.21  | 5.36     | 0.21      | 92.85      | 79.90        | +0.30                     |
| lazy-routes     | build:rspack                  | 321.75  | 92.18   | 0.00   | 0.00     | 0.19      | 92.38      | 78.54        |                           |
| lazy-routes     | build:rspack:extract          | 273.17  | 87.36   | 26.34  | 11.54    | 0.22      | 99.13      | 85.42        | +6.75                     |
| lazy-routes     | build:rspack:extract:single   | 273.17  | 87.32   | 14.75  | 5.46     | 0.22      | 93.01      | 79.99        | +0.63                     |
| lazy-routes     | build:rsbuild                 | 320.87  | 92.11   | 0.00   | 0.00     | 0.22      | 92.33      | 78.59        |                           |
| lazy-routes     | build:rsbuild:extract         | 272.29  | 87.30   | 25.17  | 11.15    | 0.25      | 98.70      | 85.25        | +6.37                     |
| lazy-routes     | build:rsbuild:extract:single  | 272.29  | 87.25   | 14.24  | 5.28     | 0.25      | 92.78      | 79.89        | +0.45                     |
| lazy-routes-128 | build                         | 1535.54 | 372.31  | 0.00   | 0.00     | 0.23      | 372.54     | 317.66       |                           |
| lazy-routes-128 | build:extract                 | 874.33  | 290.66  | 475.45 | 198.04   | 0.26      | 488.96     | 435.41       | +116.43                   |
| lazy-routes-128 | build:extract:single          | 870.05  | 289.75  | 115.89 | 35.68    | 0.27      | 325.70     | 287.83       | -46.84                    |
| lazy-routes-128 | build:extract:compact         | 736.75  | 231.38  | 419.51 | 156.64   | 0.27      | 388.29     | 336.55       | +15.75                    |
| lazy-routes-128 | build:rollup                  | 1526.42 | 371.03  | 0.00   | 0.00     | 0.21      | 371.24     | 315.88       |                           |
| lazy-routes-128 | build:rollup:extract          | 882.37  | 296.61  | 475.45 | 198.04   | 0.24      | 494.90     | 441.75       | +123.66                   |
| lazy-routes-128 | build:rollup:extract:single   | 861.22  | 287.99  | 115.89 | 35.68    | 0.25      | 323.91     | 287.48       | -47.33                    |
| lazy-routes-128 | build:rolldown                | 1652.89 | 372.45  | 0.00   | 0.00     | 0.21      | 372.66     | 318.90       |                           |
| lazy-routes-128 | build:rolldown:extract        | 1003.60 | 298.86  | 475.45 | 198.04   | 0.24      | 497.14     | 443.25       | +124.48                   |
| lazy-routes-128 | build:rolldown:extract:single | 987.74  | 290.46  | 115.89 | 35.68    | 0.25      | 326.39     | 289.70       | -46.27                    |
| lazy-routes-32  | build                         | 558.06  | 147.72  | 0.00   | 0.00     | 0.23      | 147.95     | 126.85       |                           |
| lazy-routes-32  | build:extract                 | 388.46  | 127.17  | 119.91 | 50.19    | 0.26      | 177.63     | 156.95       | +29.68                    |
| lazy-routes-32  | build:extract:single          | 387.42  | 126.81  | 40.62  | 12.69    | 0.27      | 139.76     | 122.60       | -8.19                     |
| lazy-routes-32  | build:extract:compact         | 352.03  | 111.50  | 104.42 | 39.35    | 0.26      | 151.11     | 130.19       | +3.16                     |
| lazy-routes-32  | build:rollup                  | 556.77  | 147.69  | 0.00   | 0.00     | 0.21      | 147.89     | 126.78       |                           |
| lazy-routes-32  | build:rollup:extract          | 391.77  | 128.96  | 119.91 | 50.19    | 0.24      | 179.40     | 158.78       | +31.51                    |
| lazy-routes-32  | build:rollup:extract:single   | 386.47  | 126.77  | 40.62  | 12.69    | 0.25      | 139.71     | 122.85       | -8.19                     |
| lazy-routes-32  | build:rolldown                | 587.22  | 147.17  | 0.00   | 0.00     | 0.21      | 147.37     | 126.59       |                           |
| lazy-routes-32  | build:rolldown:extract        | 420.92  | 128.74  | 119.91 | 50.19    | 0.24      | 179.18     | 158.44       | +31.80                    |
| lazy-routes-32  | build:rolldown:extract:single | 416.92  | 126.60  | 40.62  | 12.69    | 0.25      | 139.53     | 122.63       | -7.84                     |
| nextjs          | build                         | 582.31  | 178.73  | 0.00   | 0.00     | 0.00      | 178.73     | 154.95       |                           |
| nextjs          | build:webpack                 | 912.58  | 281.89  | 0.00   | 0.00     | 0.00      | 281.89     | 239.76       |                           |
| nextjs          | build:extract                 | 911.96  | 281.55  | 1.72   | 1.06     | 0.00      | 282.61     | 240.26       | +0.72                     |
| rolldown        | build                         | 221.11  | 68.60   | 0.00   | 0.00     | 0.16      | 68.76      | 59.12        |                           |
| rolldown        | build:extract                 | 220.26  | 68.31   | 0.75   | 0.41     | 0.20      | 68.93      | 59.21        | +0.17                     |
| rollup          | build                         | 222.74  | 69.69   | 0.00   | 0.00     | 0.16      | 69.85      | 60.36        |                           |
| rollup          | build:extract                 | 221.91  | 69.35   | 0.75   | 0.41     | 0.20      | 69.97      | 60.43        | +0.12                     |
| rsbuild         | build                         | 218.81  | 69.81   | 0.00   | 0.00     | 0.22      | 70.03      | 59.50        |                           |
| rsbuild         | build:extract                 | 217.68  | 69.32   | 0.74   | 0.41     | 0.25      | 69.98      | 59.42        | -0.05                     |
| rspack          | build                         | 218.73  | 69.44   | 0.00   | 0.00     | 0.18      | 69.62      | 59.16        |                           |
| rspack          | build:extract                 | 217.61  | 68.96   | 0.83   | 0.48     | 0.22      | 69.66      | 59.21        | +0.04                     |
| tanstack-router | build                         | 297.33  | 96.53   | 0.00   | 0.00     | 0.27      | 96.80      | 84.51        |                           |
| tanstack-router | build:extract                 | 295.60  | 95.43   | 1.60   | 1.06     | 0.26      | 96.75      | 83.82        | -0.05                     |
| tanstack-start  | build                         | 338.35  | 108.78  | 0.00   | 0.00     | 0.00      | 108.78     | 94.46        |                           |
| tanstack-start  | build:extract                 | 337.10  | 108.27  | 1.24   | 0.77     | 0.00      | 109.04     | 94.68        | +0.27                     |
| unloader        | build                         | 0.00    | 0.00    | 0.00   | 0.00     | 1.08      | 1.08       | 0.79         |                           |
| unloader        | build:extract                 | 0.00    | 0.00    | 1.32   | 0.56     | 0.41      | 0.97       | 0.77         | -0.12                     |
| vite            | build                         | 219.26  | 68.30   | 0.00   | 0.00     | 0.23      | 68.53      | 59.06        |                           |
| vite            | build:extract                 | 218.17  | 67.83   | 0.55   | 0.32     | 0.26      | 68.41      | 58.91        | -0.12                     |
| webpack         | build                         | 219.32  | 69.12   | 0.00   | 0.00     | 0.18      | 69.29      | 59.08        |                           |
| webpack         | build:extract                 | 218.12  | 68.61   | 0.75   | 0.41     | 0.21      | 69.23      | 58.96        | -0.06                     |

## Reading the numbers

- Compiled modules carry what each rule is made from, which the runtime formats into rules when the module loads, rather than the rules themselves. Without `extract`, `lazy-routes` ships 90.06 KiB of JavaScript gzipped and `lazy-routes-32` 147.72 KiB, against 107.31 and 213.25 KiB when compiled modules carried their rules (at `c30e063`).
- With `extract`, the JavaScript keeps only class names, a hash per rule that gzip cannot compress, and each split stylesheet carries the shared rules it may need on its own. On the lazy-routes fixtures that now costs more in total than leaving the rules to the runtime: 5 to 7 KiB gzipped on `lazy-routes`, 30 to 32 KiB on `lazy-routes-32`. One sheet per entry, `split: "single"`, ships the least of all three. What `extract` buys is runtime work: no rule is formatted or inserted while rendering, and the CSS loads in parallel with the script.
- `build:extract:compact` names each rule `_` and a digit or two instead of a hash ([Compact class names](./extraction.md#compact-class-names)). Against `build:extract` that ships 6.77, 26.52 and 100.67 KiB less gzipped with 8, 32 and 128 routes, 4.26, 15.67 and 59.28 of it JavaScript, and cuts the CSS a navigation fetches on average from 1.24 to 0.98, 1.52 to 1.19 and 1.53 to 1.21 KiB. With 8 routes it ships less in total than leaving the rules to the runtime; with 32 and 128 it ships 3.16 and 15.75 KiB more, against 29.68 and 116.43 with hashed names.
- The small examples style a handful of elements, so extracting their rules adds a CSS response that costs about what the JavaScript it saves does: from 0.12 KiB gzipped less in total to 0.72 KiB more.
- Their runtime values, such as the counter's colour, are set as custom properties that one extracted rule per property reads ([Runtime values](./how-it-works.md#runtime-values)), so with `extract` no code that formats rules ships: Vite's extract build ships 0.28 KiB less gzipped in total than at `09f2473`. The lazy-routes builds, whose styles are all literals, ship within 0.3 KiB gzipped of what they did, most of it the runtime that merges custom properties into an element's style.
- Split builds ship more CSS in total than single-sheet builds, because each lazily loaded route carries the shared rules it may need on its own. What matters for a visit is what each navigation fetches, which `--routes` and `--browser` report.
- Bun and Next.js with Turbopack load nishiki's lean runtime in client builds like the other bundlers. Built on the same machine at `c18ab6c`, the commit before they did, Bun's JavaScript was 69.91 KiB gzipped and Next.js with Turbopack's 182.00 KiB, against 66.52 and 178.73 KiB at `06e8876`: about 3.3 KiB less each, the difference between the full and the lean runtime.
