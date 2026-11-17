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

The flags, and how each column is measured, are described in the [examples README](https://github.com/x-ryoppippi/nishiki/tree/main/examples#benchmark).

## Sizes

`just bench` output for commit `06e8876`, measured on 17 November 2026. Sizes are in KiB; the last column is the gzip difference `extract` makes against the runtime build. Next.js's extract build is compared with its webpack build, and server output is left out.

| Example         | Task                          | JS      | JS gzip | CSS    | CSS gzip | HTML gzip | Total gzip | Total brotli | extract vs runtime (gzip) |
| --------------- | ----------------------------- | ------- | ------- | ------ | -------- | --------- | ---------- | ------------ | ------------------------- |
| bun             | build                         | 212.89  | 66.52   | 0.00   | 0.00     | 0.16      | 66.68      | 57.75        |                           |
| bun             | build:extract                 | 211.58  | 66.18   | 1.29   | 0.60     | 0.18      | 66.96      | 57.90        | +0.27                     |
| esbuild         | build                         | 223.99  | 69.77   | 0.00   | 0.00     | 0.16      | 69.93      | 60.27        |                           |
| esbuild         | build:extract                 | 222.68  | 69.43   | 1.20   | 0.52     | 0.18      | 70.13      | 60.34        | +0.20                     |
| farm            | build                         | 226.68  | 72.45   | 0.00   | 0.00     | 2.86      | 75.31      | 64.80        |                           |
| farm            | build:extract                 | 225.36  | 72.10   | 1.15   | 0.57     | 2.90      | 75.57      | 64.98        | +0.26                     |
| lazy-routes     | build                         | 419.16  | 107.31  | 0.00   | 0.00     | 0.23      | 107.54     | 91.52        |                           |
| lazy-routes     | build:extract                 | 295.97  | 89.35   | 26.39  | 11.54    | 0.26      | 101.15     | 87.59        | -6.39                     |
| lazy-routes     | build:extract:single          | 295.71  | 89.22   | 15.21  | 5.19     | 0.26      | 94.68      | 81.84        | -12.86                    |
| lazy-routes     | build:rollup                  | 419.85  | 107.49  | 0.00   | 0.00     | 0.21      | 107.70     | 91.64        |                           |
| lazy-routes     | build:rollup:extract          | 298.14  | 90.20   | 26.39  | 11.54    | 0.24      | 101.98     | 88.47        | -5.72                     |
| lazy-routes     | build:rollup:extract:single   | 296.80  | 89.65   | 15.21  | 5.19     | 0.25      | 95.08      | 82.21        | -12.62                    |
| lazy-routes     | build:rolldown                | 426.00  | 106.73  | 0.00   | 0.00     | 0.21      | 106.94     | 90.93        |                           |
| lazy-routes     | build:rolldown:extract        | 303.95  | 89.33   | 26.39  | 11.54    | 0.24      | 101.11     | 87.62        | -5.83                     |
| lazy-routes     | build:rolldown:extract:single | 302.93  | 88.79   | 15.21  | 5.19     | 0.25      | 94.23      | 81.37        | -12.71                    |
| lazy-routes     | build:webpack                 | 442.48  | 110.51  | 0.00   | 0.00     | 0.19      | 110.70     | 92.83        |                           |
| lazy-routes     | build:webpack:extract         | 309.24  | 91.99   | 26.39  | 11.53    | 0.21      | 103.74     | 89.16        | -6.96                     |
| lazy-routes     | build:webpack:extract:single  | 309.24  | 91.95   | 15.21  | 5.36     | 0.21      | 97.52      | 83.51        | -13.18                    |
| lazy-routes     | build:rspack                  | 441.58  | 110.05  | 0.00   | 0.00     | 0.19      | 110.24     | 92.72        |                           |
| lazy-routes     | build:rspack:extract          | 308.58  | 92.00   | 26.34  | 11.54    | 0.22      | 103.76     | 89.08        | -6.48                     |
| lazy-routes     | build:rspack:extract:single   | 308.58  | 91.96   | 14.75  | 5.46     | 0.22      | 97.64      | 83.52        | -12.60                    |
| lazy-routes     | build:rsbuild                 | 440.66  | 109.73  | 0.00   | 0.00     | 0.22      | 109.95     | 92.72        |                           |
| lazy-routes     | build:rsbuild:extract         | 307.69  | 91.90   | 25.17  | 11.15    | 0.25      | 103.30     | 88.80        | -6.65                     |
| lazy-routes     | build:rsbuild:extract:single  | 307.69  | 91.85   | 14.24  | 5.28     | 0.25      | 97.38      | 83.46        | -12.57                    |
| lazy-routes-128 | build                         | 3137.78 | 626.96  | 0.00   | 0.00     | 0.23      | 627.20     | 522.68       |                           |
| lazy-routes-128 | build:extract                 | 1371.67 | 371.90  | 475.45 | 198.04   | 0.26      | 570.21     | 499.07       | -56.99                    |
| lazy-routes-128 | build:extract:single          | 1367.38 | 370.57  | 115.89 | 35.68    | 0.27      | 406.52     | 351.35       | -220.67                   |
| lazy-routes-128 | build:rollup                  | 3128.61 | 625.91  | 0.00   | 0.00     | 0.21      | 626.12     | 520.56       |                           |
| lazy-routes-128 | build:rollup:extract          | 1379.69 | 377.69  | 475.45 | 198.04   | 0.24      | 575.98     | 504.71       | -50.14                    |
| lazy-routes-128 | build:rollup:extract:single   | 1358.54 | 369.48  | 115.89 | 35.68    | 0.25      | 405.40     | 349.73       | -220.72                   |
| lazy-routes-128 | build:rolldown                | 3255.08 | 629.13  | 0.00   | 0.00     | 0.21      | 629.33     | 523.93       |                           |
| lazy-routes-128 | build:rolldown:extract        | 1501.10 | 379.31  | 475.45 | 198.04   | 0.24      | 577.59     | 507.21       | -51.74                    |
| lazy-routes-128 | build:rolldown:extract:single | 1485.07 | 371.19  | 115.89 | 35.68    | 0.25      | 407.12     | 353.25       | -222.21                   |
| lazy-routes-32  | build                         | 972.04  | 213.25  | 0.00   | 0.00     | 0.23      | 213.48     | 179.53       |                           |
| lazy-routes-32  | build:extract                 | 515.01  | 147.35  | 119.91 | 50.19    | 0.27      | 197.81     | 172.66       | -15.67                    |
| lazy-routes-32  | build:extract:single          | 513.97  | 146.94  | 40.62  | 12.69    | 0.27      | 159.89     | 138.33       | -53.59                    |
| lazy-routes-32  | build:rollup                  | 970.70  | 213.09  | 0.00   | 0.00     | 0.21      | 213.29     | 179.19       |                           |
| lazy-routes-32  | build:rollup:extract          | 518.32  | 149.11  | 119.91 | 50.19    | 0.24      | 199.54     | 174.42       | -13.75                    |
| lazy-routes-32  | build:rollup:extract:single   | 513.01  | 147.00  | 40.62  | 12.69    | 0.25      | 159.94     | 138.35       | -53.36                    |
| lazy-routes-32  | build:rolldown                | 1001.16 | 213.10  | 0.00   | 0.00     | 0.21      | 213.30     | 179.25       |                           |
| lazy-routes-32  | build:rolldown:extract        | 547.51  | 148.70  | 119.91 | 50.19    | 0.24      | 199.13     | 174.23       | -14.17                    |
| lazy-routes-32  | build:rolldown:extract:single | 543.47  | 146.61  | 40.62  | 12.69    | 0.25      | 159.54     | 138.40       | -53.76                    |
| nextjs          | build                         | 582.56  | 178.73  | 0.00   | 0.00     | 0.00      | 178.73     | 154.92       |                           |
| nextjs          | build:webpack                 | 912.84  | 281.46  | 0.00   | 0.00     | 0.00      | 281.46     | 239.76       |                           |
| nextjs          | build:extract                 | 912.50  | 281.38  | 1.65   | 1.03     | 0.00      | 282.41     | 240.47       | +0.95                     |
| rolldown        | build                         | 221.88  | 68.73   | 0.00   | 0.00     | 0.16      | 68.89      | 59.26        |                           |
| rolldown        | build:extract                 | 220.94  | 68.60   | 0.69   | 0.38     | 0.20      | 69.18      | 59.44        | +0.29                     |
| rollup          | build                         | 223.40  | 69.74   | 0.00   | 0.00     | 0.16      | 69.91      | 60.48        |                           |
| rollup          | build:extract                 | 222.49  | 69.61   | 0.69   | 0.38     | 0.20      | 70.20      | 60.65        | +0.29                     |
| rsbuild         | build                         | 219.63  | 69.97   | 0.00   | 0.00     | 0.22      | 70.19      | 59.68        |                           |
| rsbuild         | build:extract                 | 218.31  | 69.61   | 0.68   | 0.38     | 0.25      | 70.25      | 59.67        | +0.06                     |
| rspack          | build                         | 219.56  | 69.61   | 0.00   | 0.00     | 0.18      | 69.79      | 59.30        |                           |
| rspack          | build:extract                 | 218.25  | 69.26   | 0.77   | 0.45     | 0.22      | 69.93      | 59.43        | +0.14                     |
| tanstack-router | build                         | 299.59  | 97.27   | 0.00   | 0.00     | 0.27      | 97.54      | 85.09        |                           |
| tanstack-router | build:extract                 | 296.82  | 96.45   | 1.57   | 1.04     | 0.29      | 97.78      | 85.36        | +0.24                     |
| tanstack-start  | build                         | 340.13  | 109.30  | 0.00   | 0.00     | 0.00      | 109.30     | 95.00        |                           |
| tanstack-start  | build:extract                 | 337.94  | 108.76  | 1.21   | 0.75     | 0.00      | 109.52     | 95.08        | +0.21                     |
| unloader        | build                         | 0.00    | 0.00    | 0.00   | 0.00     | 1.06      | 1.06       | 0.77         |                           |
| unloader        | build:extract                 | 0.00    | 0.00    | 1.23   | 0.52     | 0.76      | 1.28       | 0.94         | +0.22                     |
| vite            | build                         | 219.68  | 68.36   | 0.00   | 0.00     | 0.23      | 68.59      | 59.13        |                           |
| vite            | build:extract                 | 218.79  | 68.12   | 0.52   | 0.30     | 0.27      | 68.69      | 59.18        | +0.10                     |
| webpack         | build                         | 220.12  | 69.27   | 0.00   | 0.00     | 0.18      | 69.45      | 59.22        |                           |
| webpack         | build:extract                 | 218.81  | 68.93   | 0.69   | 0.38     | 0.21      | 69.52      | 59.26        | +0.07                     |

## Reading the numbers

- The small examples style a handful of elements, so extracting their rules adds a CSS response that costs slightly more than the JavaScript it saves: 0.1 to 1 KiB gzipped in total.
- `lazy-routes` styles eight lazily loaded routes and a twelve-component UI library. There, extraction removes about 130 KiB of JavaScript and saves 6 to 13 KiB gzipped in total.
- Its split builds ship more CSS in total than its single-sheet builds, because each lazily loaded route carries the shared rules it may need on its own. What matters for a visit is what each navigation fetches, which `--routes` and `--browser` report.
- Bun and Next.js with Turbopack load nishiki's lean runtime in client builds like the other bundlers. Built on the same machine at `c18ab6c`, the commit before they did, Bun's JavaScript was 69.91 KiB gzipped and Next.js with Turbopack's 182.00 KiB, against 66.52 and 178.73 KiB above: about 3.3 KiB less each, the difference between the full and the lean runtime.
