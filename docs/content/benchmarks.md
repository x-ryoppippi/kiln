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

`just bench` output for commit `2d6e9ec`, measured on 17 November 2026. Sizes are in KiB; the last column is the gzip difference `extract` makes against the runtime build. Next.js's extract build is compared with its webpack build, and server output is left out.

| Example         | Task                          | JS      | JS gzip | CSS    | CSS gzip | HTML gzip | Total gzip | Total brotli | extract vs runtime (gzip) |
| --------------- | ----------------------------- | ------- | ------- | ------ | -------- | --------- | ---------- | ------------ | ------------------------- |
| bun             | build                         | 211.81  | 66.24   | 0.00   | 0.00     | 0.16      | 66.40      | 57.58        |                           |
| bun             | build:extract                 | 211.46  | 66.20   | 1.29   | 0.60     | 0.18      | 66.98      | 58.04        | +0.58                     |
| esbuild         | build                         | 222.89  | 69.49   | 0.00   | 0.00     | 0.16      | 69.65      | 60.04        |                           |
| esbuild         | build:extract                 | 222.55  | 69.42   | 1.20   | 0.52     | 0.18      | 70.13      | 60.43        | +0.48                     |
| farm            | build                         | 225.59  | 72.16   | 0.00   | 0.00     | 2.87      | 75.03      | 64.54        |                           |
| farm            | build:extract                 | 225.26  | 72.10   | 1.15   | 0.57     | 2.90      | 75.57      | 64.99        | +0.55                     |
| lazy-routes     | build                         | 308.75  | 90.01   | 0.00   | 0.00     | 0.23      | 90.24      | 77.62        |                           |
| lazy-routes     | build:extract                 | 262.87  | 83.82   | 26.39  | 11.54    | 0.27      | 95.62      | 83.36        | +5.38                     |
| lazy-routes     | build:extract:single          | 262.61  | 83.70   | 15.21  | 5.19     | 0.27      | 89.16      | 77.53        | -1.09                     |
| lazy-routes     | build:rollup                  | 309.45  | 90.28   | 0.00   | 0.00     | 0.21      | 90.49      | 77.90        |                           |
| lazy-routes     | build:rollup:extract          | 265.01  | 84.66   | 26.39  | 11.54    | 0.24      | 96.44      | 84.24        | +5.95                     |
| lazy-routes     | build:rollup:extract:single   | 263.67  | 84.08   | 15.21  | 5.19     | 0.25      | 89.52      | 77.95        | -0.97                     |
| lazy-routes     | build:rolldown                | 315.58  | 89.36   | 0.00   | 0.00     | 0.21      | 89.57      | 76.98        |                           |
| lazy-routes     | build:rolldown:extract        | 270.83  | 83.84   | 26.39  | 11.54    | 0.24      | 95.62      | 83.42        | +6.05                     |
| lazy-routes     | build:rolldown:extract:single | 269.82  | 83.28   | 15.21  | 5.19     | 0.25      | 88.72      | 77.18        | -0.85                     |
| lazy-routes     | build:webpack                 | 322.76  | 92.30   | 0.00   | 0.00     | 0.19      | 92.49      | 78.73        |                           |
| lazy-routes     | build:webpack:extract         | 273.85  | 87.27   | 26.39  | 11.53    | 0.21      | 99.01      | 85.59        | +6.53                     |
| lazy-routes     | build:webpack:extract:single  | 273.85  | 87.23   | 15.21  | 5.36     | 0.21      | 92.80      | 79.82        | +0.31                     |
| lazy-routes     | build:rspack                  | 321.62  | 92.12   | 0.00   | 0.00     | 0.19      | 92.31      | 78.45        |                           |
| lazy-routes     | build:rspack:extract          | 273.04  | 87.31   | 26.34  | 11.54    | 0.22      | 99.08      | 85.35        | +6.77                     |
| lazy-routes     | build:rspack:extract:single   | 273.04  | 87.27   | 14.75  | 5.46     | 0.22      | 92.95      | 79.96        | +0.64                     |
| lazy-routes     | build:rsbuild                 | 320.77  | 92.07   | 0.00   | 0.00     | 0.22      | 92.29      | 78.64        |                           |
| lazy-routes     | build:rsbuild:extract         | 272.13  | 87.22   | 25.17  | 11.15    | 0.25      | 98.63      | 85.03        | +6.33                     |
| lazy-routes     | build:rsbuild:extract:single  | 272.13  | 87.17   | 14.24  | 5.28     | 0.25      | 92.71      | 79.70        | +0.41                     |
| lazy-routes-128 | build                         | 1535.42 | 372.01  | 0.00   | 0.00     | 0.23      | 372.24     | 317.66       |                           |
| lazy-routes-128 | build:extract                 | 874.21  | 290.76  | 475.45 | 198.04   | 0.26      | 489.06     | 435.48       | +116.82                   |
| lazy-routes-128 | build:extract:single          | 869.93  | 289.46  | 115.89 | 35.68    | 0.27      | 325.41     | 287.88       | -46.83                    |
| lazy-routes-128 | build:rollup                  | 1526.25 | 370.93  | 0.00   | 0.00     | 0.21      | 371.14     | 315.89       |                           |
| lazy-routes-128 | build:rollup:extract          | 882.17  | 296.49  | 475.45 | 198.04   | 0.24      | 494.78     | 441.62       | +123.64                   |
| lazy-routes-128 | build:rollup:extract:single   | 861.02  | 287.96  | 115.89 | 35.68    | 0.25      | 323.88     | 287.44       | -47.25                    |
| lazy-routes-128 | build:rolldown                | 1652.73 | 372.37  | 0.00   | 0.00     | 0.21      | 372.58     | 318.90       |                           |
| lazy-routes-128 | build:rolldown:extract        | 1003.48 | 298.79  | 475.45 | 198.04   | 0.24      | 497.08     | 443.27       | +124.50                   |
| lazy-routes-128 | build:rolldown:extract:single | 987.62  | 290.40  | 115.89 | 35.68    | 0.25      | 326.32     | 289.67       | -46.25                    |
| lazy-routes-32  | build                         | 557.94  | 147.71  | 0.00   | 0.00     | 0.23      | 147.94     | 126.78       |                           |
| lazy-routes-32  | build:extract                 | 388.34  | 127.17  | 119.91 | 50.19    | 0.27      | 177.63     | 156.86       | +29.69                    |
| lazy-routes-32  | build:extract:single          | 387.30  | 126.83  | 40.62  | 12.69    | 0.27      | 139.78     | 122.58       | -8.16                     |
| lazy-routes-32  | build:rollup                  | 556.60  | 147.53  | 0.00   | 0.00     | 0.21      | 147.74     | 126.64       |                           |
| lazy-routes-32  | build:rollup:extract          | 391.61  | 128.96  | 119.91 | 50.19    | 0.24      | 179.39     | 158.81       | +31.65                    |
| lazy-routes-32  | build:rollup:extract:single   | 386.30  | 126.79  | 40.62  | 12.69    | 0.25      | 139.72     | 122.85       | -8.02                     |
| lazy-routes-32  | build:rolldown                | 587.06  | 147.08  | 0.00   | 0.00     | 0.21      | 147.29     | 126.59       |                           |
| lazy-routes-32  | build:rolldown:extract        | 420.80  | 128.68  | 119.91 | 50.19    | 0.24      | 179.11     | 158.39       | +31.83                    |
| lazy-routes-32  | build:rolldown:extract:single | 416.80  | 126.53  | 40.62  | 12.69    | 0.25      | 139.47     | 122.63       | -7.82                     |
| nextjs          | build                         | 582.08  | 178.60  | 0.00   | 0.00     | 0.00      | 178.60     | 154.82       |                           |
| nextjs          | build:webpack                 | 912.36  | 281.33  | 0.00   | 0.00     | 0.00      | 281.33     | 239.67       |                           |
| nextjs          | build:extract                 | 912.52  | 281.41  | 1.65   | 1.03     | 0.00      | 282.44     | 240.51       | +1.11                     |
| rolldown        | build                         | 220.78  | 68.45   | 0.00   | 0.00     | 0.16      | 68.61      | 59.01        |                           |
| rolldown        | build:extract                 | 220.81  | 68.59   | 0.69   | 0.38     | 0.20      | 69.18      | 59.46        | +0.57                     |
| rollup          | build                         | 222.39  | 69.51   | 0.00   | 0.00     | 0.16      | 69.67      | 60.19        |                           |
| rollup          | build:extract                 | 222.44  | 69.64   | 0.69   | 0.38     | 0.20      | 70.23      | 60.63        | +0.55                     |
| rsbuild         | build                         | 218.55  | 69.68   | 0.00   | 0.00     | 0.22      | 69.90      | 59.39        |                           |
| rsbuild         | build:extract                 | 218.18  | 69.60   | 0.68   | 0.38     | 0.25      | 70.24      | 59.71        | +0.33                     |
| rspack          | build                         | 218.46  | 69.31   | 0.00   | 0.00     | 0.18      | 69.50      | 59.04        |                           |
| rspack          | build:extract                 | 218.10  | 69.25   | 0.77   | 0.45     | 0.22      | 69.92      | 59.38        | +0.42                     |
| tanstack-router | build                         | 297.05  | 96.41   | 0.00   | 0.00     | 0.27      | 96.67      | 84.36        |                           |
| tanstack-router | build:extract                 | 296.20  | 95.80   | 1.57   | 1.04     | 0.26      | 97.11      | 84.22        | +0.43                     |
| tanstack-start  | build                         | 338.07  | 108.64  | 0.00   | 0.00     | 0.00      | 108.64     | 94.34        |                           |
| tanstack-start  | build:extract                 | 337.69  | 108.65  | 1.21   | 0.75     | 0.00      | 109.40     | 95.11        | +0.76                     |
| unloader        | build                         | 0.00    | 0.00    | 0.00   | 0.00     | 1.06      | 1.06       | 0.77         |                           |
| unloader        | build:extract                 | 0.00    | 0.00    | 1.23   | 0.52     | 0.76      | 1.28       | 0.94         | +0.22                     |
| vite            | build                         | 218.99  | 68.17   | 0.00   | 0.00     | 0.23      | 68.40      | 58.92        |                           |
| vite            | build:extract                 | 218.74  | 68.12   | 0.52   | 0.30     | 0.27      | 68.69      | 59.18        | +0.29                     |
| webpack         | build                         | 219.01  | 68.99   | 0.00   | 0.00     | 0.18      | 69.16      | 59.06        |                           |
| webpack         | build:extract                 | 218.67  | 68.92   | 0.69   | 0.38     | 0.21      | 69.51      | 59.36        | +0.35                     |

## Reading the numbers

- Compiled modules carry what each rule is made from, which the runtime formats into rules when the module loads, rather than the rules themselves. Without `extract`, `lazy-routes` ships 90.01 KiB of JavaScript gzipped and `lazy-routes-32` 147.71 KiB, against 107.31 and 213.25 KiB when compiled modules carried their rules (at `c30e063`).
- With `extract`, the JavaScript keeps only class names, a hash per rule that gzip cannot compress, and each split stylesheet carries the shared rules it may need on its own. On the lazy-routes fixtures that now costs more in total than leaving the rules to the runtime: 5 to 7 KiB gzipped on `lazy-routes`, 30 to 32 KiB on `lazy-routes-32`. One sheet per entry, `split: "single"`, ships the least of all three. What `extract` buys is runtime work: no rule is formatted or inserted while rendering, and the CSS loads in parallel with the script.
- The small examples style a handful of elements, so extracting their rules adds a CSS response that costs slightly more than the JavaScript it saves: 0.2 to 1.1 KiB gzipped in total.
- Split builds ship more CSS in total than single-sheet builds, because each lazily loaded route carries the shared rules it may need on its own. What matters for a visit is what each navigation fetches, which `--routes` and `--browser` report.
- Bun and Next.js with Turbopack load nishiki's lean runtime in client builds like the other bundlers. Built on the same machine at `c18ab6c`, the commit before they did, Bun's JavaScript was 69.91 KiB gzipped and Next.js with Turbopack's 182.00 KiB, against 66.52 and 178.73 KiB at `06e8876`: about 3.3 KiB less each, the difference between the full and the lean runtime.
