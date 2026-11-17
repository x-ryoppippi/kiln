// Builds the lazy-routes app with nishiki and with other styling libraries (bench/compare/<library>) and compares what
// each ships and costs. See docs/content/library-benchmarks.md for the method.
//
//   node scripts/bench-compare.ts                        # sizes and load paths, reusing cached builds
//   node scripts/bench-compare.ts --browser --time       # also unused CSS, style parity and timings in Chromium, and build times
//   node scripts/bench-compare.ts --json results.json    # also every field, as JSON
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import {
  findChrome,
  launch,
  median,
  summariseRuns,
  type Browser,
  type BrowserResult,
  type Run,
} from "./bench/browser.ts";
import { shareOf, type Unused } from "./bench/css.ts";
import { serve, type Server } from "./bench/serve.ts";
import { SIZES } from "./compare/generate.ts";
import { attribute, loadPaths, measureFiles, type Attribution, type LoadPaths, type Sizes } from "./compare/measure.ts";
import { stressProbe, type Stress } from "./compare/stress.ts";

const { values } = parseArgs({
  options: {
    browser: { type: "boolean", default: false },
    time: { type: "boolean", default: false },
    stress: { type: "boolean", default: false },
    runs: { type: "string" },
    only: { type: "string", multiple: true },
    sizes: { type: "string", multiple: true },
    json: { type: "string" },
  },
});
const runsOf = (fallback: number) => {
  const runs = Number(values.runs ?? fallback);
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`--runs must be a positive integer, got ${values.runs}`);
  return runs;
};

const root = path.resolve(import.meta.dirname, "..");
const compareDir = path.join(root, "bench/compare");

type Variant = { name: string; dir: string; suffix: string; packages: string[]; note: string };
// Every build of the same app, with the packages whose versions the report lists.
const VARIANTS: Variant[] = [
  { name: "unstyled", dir: "unstyled", suffix: "", packages: [], note: "baseline: the same markup with no styles" },
  {
    name: "nishiki (runtime)",
    dir: "nishiki",
    suffix: "",
    packages: ["@nishikijs/react"],
    note: "`css` prop and `styled`, no compiler",
  },
  {
    name: "nishiki (compiled)",
    dir: "nishiki",
    suffix: ":compiled",
    packages: ["@nishikijs/react"],
    note: "the same source with the Vite plugin, without extract",
  },
  {
    name: "nishiki (extract)",
    dir: "nishiki",
    suffix: ":extract",
    packages: ["@nishikijs/react"],
    note: "the same source with the Vite plugin and `extract: true` (a sheet per chunk)",
  },
  { name: "restyle", dir: "restyle", suffix: "", packages: ["restyle"], note: "`css` prop and `styled`" },
  {
    name: "Emotion",
    dir: "emotion",
    suffix: "",
    packages: ["@emotion/react", "@emotion/styled"],
    note: "`css` prop and `styled`, no Babel plugin",
  },
  {
    name: "styled-components",
    dir: "styled-components",
    suffix: "",
    packages: ["styled-components"],
    note: "object styles; elements styled in place are components of their own; no Babel plugin",
  },
  {
    name: "Linaria",
    dir: "linaria",
    suffix: "",
    packages: ["@linaria/core", "@linaria/react", "@wyw-in-js/vite"],
    note: "`styled` and `css` template literals, compiled by wyw-in-js",
  },
  {
    name: "vanilla-extract",
    dir: "vanilla-extract",
    suffix: "",
    packages: ["@vanilla-extract/css", "@vanilla-extract/vite-plugin"],
    note: "`style()` in a `.css.ts` file beside each module",
  },
  {
    name: "StyleX",
    dir: "stylex",
    suffix: "",
    packages: ["@stylexjs/stylex", "@stylexjs/unplugin"],
    note: "`stylex.create` per module; attribute selectors become conditional styles",
  },
  {
    name: "Panda CSS",
    dir: "panda",
    suffix: "",
    packages: ["@pandacss/dev"],
    note: "`css()` and `styled()` from the generated styled-system, PostCSS, no preflight",
  },
  {
    name: "Tailwind CSS",
    dir: "tailwind",
    suffix: "",
    packages: ["tailwindcss", "@tailwindcss/vite"],
    note: "utility classes (arbitrary values where no utility states the declaration), no preflight",
  },
];
const REFERENCE = "nishiki (runtime)";

const sizes = (values.sizes ?? SIZES.map(String)).map(Number);
const variants = VARIANTS.filter(
  (variant) => !values.only || values.only.some((name) => variant.dir === name || variant.name === name),
);

type Build = {
  variant: string;
  routes: number;
  task: string;
  out: string;
  js: Sizes & { files: number };
  css: Sizes & { files: number };
  html: Sizes & { files: number };
  attribution: Attribution;
  loads: LoadPaths;
  browser: (Omit<BrowserResult, "runs"> & { parity: Parity | null; runs: Run[] }) | null;
  time: { median: number; min: number; max: number; runs: number[] } | null;
  stress: Stress | null;
};
// How many computed property values of the rendered elements equal the reference build's, over every step.
type Parity = { compared: number; equal: number; byProperty: Record<string, number> };

function vp(args: string[], cwd = root) {
  const result = spawnSync("vp", args, { cwd, encoding: "utf8", shell: process.platform === "win32" });
  if (result.status !== 0) {
    process.stderr.write(result.stdout + result.stderr);
    throw new Error(`vp ${args.join(" ")} failed`);
  }
}

const packageOf = (variant: Variant) => `compare-${variant.dir}`;
const taskOf = (variant: Variant, routes: number) => `compare:${routes}${variant.suffix}`;
const outOf = (variant: Variant, routes: number) =>
  path.join(compareDir, variant.dir, `dist-${routes}${variant.suffix.replaceAll(":", "-")}`);

const builds: Build[] = [];
for (const routes of sizes) {
  for (const variant of variants) {
    const task = taskOf(variant, routes);
    process.stderr.write(`${variant.name}, ${routes} routes: ${packageOf(variant)}#${task}\n`);
    vp(["run", `${packageOf(variant)}#${task}`]);
    const out = outOf(variant, routes);
    builds.push({
      variant: variant.name,
      routes,
      task,
      out,
      js: await measureFiles(out, ".js"),
      css: await measureFiles(out, ".css"),
      html: await measureFiles(out, ".html"),
      attribution: await attribute(out),
      loads: await loadPaths(out),
      browser: null,
      time: null,
      stress: null,
    });
  }
}

// Computed styles of every rendered element, which the parity check compares with the reference build's.
const PROPERTIES = [
  "display",
  "position",
  "flex-direction",
  "flex-wrap",
  "align-items",
  "justify-content",
  "row-gap",
  "column-gap",
  "grid-template-columns",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "color",
  "background-color",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-transform",
  "white-space",
  "border-top-width",
  "border-top-style",
  "border-top-color",
  "border-right-width",
  "border-bottom-width",
  "border-bottom-style",
  "border-bottom-color",
  "border-left-width",
  "border-left-color",
  "border-top-left-radius",
  "box-shadow",
  "overflow-x",
  "opacity",
  "z-index",
  "transform",
  "aspect-ratio",
  "min-width",
  "max-width",
  "min-height",
];
const FINGERPRINT = `(() => {
  const properties = ${JSON.stringify(PROPERTIES)};
  return [...document.querySelectorAll("#root *")]
    .filter((element) => element.checkVisibility())
    .map((element) => {
      const style = getComputedStyle(element);
      return [element.tagName, ...properties.map((property) => style.getPropertyValue(property))];
    });
})()`;

// Tailwind composes `box-shadow` with transparent ring and inset shadows, which draw nothing.
const normalise = (value: string) => value.replaceAll("rgba(0, 0, 0, 0) 0px 0px 0px 0px, ", "");

function parityOf(run: Run, reference: Run): Parity {
  const parity: Parity = { compared: 0, equal: 0, byProperty: {} };
  run.steps.forEach((step, index) => {
    const mine = step.probe as string[][];
    const theirs = reference.steps[index]!.probe as string[][];
    if (mine.length !== theirs.length) {
      throw new Error(`step ${step.label} renders ${mine.length} elements against the reference's ${theirs.length}`);
    }
    mine.forEach((element, i) => {
      if (element[0] !== theirs[i]![0]) throw new Error(`step ${step.label} renders a different element at ${i}`);
      PROPERTIES.forEach((property, p) => {
        parity.compared++;
        if (normalise(element[p + 1]!) === normalise(theirs[i]![p + 1]!)) parity.equal++;
        else parity.byProperty[property] = (parity.byProperty[property] ?? 0) + 1;
      });
    });
  });
  return parity;
}

const chrome = values.browser || values.stress ? findChrome() : undefined;
if ((values.browser || values.stress) && !chrome) {
  process.stderr.write("--browser, --stress: no Chrome or Chromium found; set CHROME_PATH. Skipping them.\n");
}

if (chrome && values.browser) {
  const runs = runsOf(5);
  const servers = new Map<Build, Server>();
  const results = new Map<Build, Run[]>(builds.map((build) => [build, []]));
  let browser: Browser | undefined;
  try {
    for (const build of builds) servers.set(build, await serve(build.out));
    browser = await launch(chrome, { rules: "selectors", probe: FINGERPRINT });
    // A freshly started browser runs its first page markedly slower, so one run is thrown away.
    await browser.run(servers.get(builds[0]!)!);
    // Runs go round the builds in turn, so a machine that slows down favours none of them.
    for (let run = 0; run < runs; run++) {
      for (const build of builds) {
        process.stderr.write(`${build.variant}, ${build.routes} routes: browser run ${run + 1} of ${runs}\n`);
        results.get(build)!.push(await browser.run(servers.get(build)!));
      }
    }
  } finally {
    await browser?.close();
    for (const server of servers.values()) await server.close();
  }
  for (const build of builds) {
    const summary = summariseRuns(`${build.variant} ${build.routes}`, results.get(build)!);
    const reference = builds.find((other) => other.routes === build.routes && other.variant === REFERENCE);
    const parity =
      reference && build.variant !== "unstyled" ? parityOf(results.get(build)![0]!, results.get(reference)![0]!) : null;
    build.browser = { ...summary, parity };
  }
  // The fingerprints are only needed for parity, and would make the JSON hundreds of megabytes.
  for (const build of builds) for (const run of build.browser!.runs) for (const step of run.steps) delete step.probe;
  for (const build of builds) for (const step of build.browser!.steps) delete step.probe;
}

if (chrome && values.stress) {
  const runs = runsOf(5);
  for (const variant of variants) vp(["run", `${packageOf(variant)}#compare:stress${variant.suffix}`]);
  const stress = await stressProbe(chrome, variants, runs);
  for (const build of builds) build.stress = stress.get(build.variant) ?? null;
}

if (values.time) {
  const runs = runsOf(5);
  const times = new Map<Build, number[]>(builds.map((build) => [build, []]));
  for (let run = 0; run < runs; run++) {
    for (const build of builds) {
      const variant = VARIANTS.find((variant) => variant.name === build.variant)!;
      process.stderr.write(`${build.variant}, ${build.routes} routes: timed build ${run + 1} of ${runs}\n`);
      const start = performance.now();
      vp(["run", "--no-cache", "--ignore-depends-on", `${packageOf(variant)}#${build.task}`]);
      times.get(build)!.push(performance.now() - start);
    }
  }
  for (const build of builds) {
    const runs = times.get(build)!;
    build.time = { median: median(runs), min: Math.min(...runs), max: Math.max(...runs), runs };
  }
}

// The installed version of each library package, read from the compared app's own node_modules.
const versionOf = (dir: string, name: string): string =>
  JSON.parse(readFileSync(path.join(compareDir, dir, "node_modules", name, "package.json"), "utf8")).version;
const commit = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
const versions: Record<string, string> = {};
for (const variant of variants) {
  for (const name of variant.packages) {
    versions[name] = name === "@nishikijs/react" ? `${commit} (this repository)` : versionOf(variant.dir, name);
  }
}
const reactVersion = versionOf("unstyled", "react");

if (values.json) {
  writeFileSync(
    values.json,
    JSON.stringify({ commit, react: reactVersion, versions, variants, builds }, null, 2) + "\n",
  );
}
function markdown(): string {
  const kb = (bytes: number) => (bytes / 1024).toFixed(1);
  const pct = (share: number | null | undefined) =>
    share === null || share === undefined ? "-" : `${(share * 100).toFixed(0)}%`;
  const ms = (value: number) => value.toFixed(0);
  const table = (header: string[], rows: string[][]) =>
    [header, header.map(() => "---"), ...rows].map((cells) => `| ${cells.join(" | ")} |`).join("\n") + "\n";
  const baselineOf = (build: Build) =>
    builds.find((other) => other.routes === build.routes && other.variant === "unstyled");

  let output = `Versions: React ${reactVersion}; ${Object.entries(versions)
    .map(([name, version]) => `${name} ${version}`)
    .join(", ")}.\n`;
  for (const routes of sizes) {
    const rows = builds.filter((build) => build.routes === routes);
    output += `\n### ${routes} routes\n\nSizes in KiB; gzip unless stated. Each file is gzipped on its own, as it is served.\n\n`;
    output += table(
      [
        "Library",
        "JS",
        "CSS",
        "Total",
        "Total (brotli)",
        "Library runtime (min / gzip)",
        "JS beyond baseline (min)",
        "First load (JS + CSS + HTML)",
        "Navigation, mean (worst)",
        "CSS requests: first load / navigation (mean)",
      ],
      rows.map((build) => {
        const baseline = baselineOf(build);
        const { firstLoad, navigation } = build.loads;
        return [
          build.variant,
          kb(build.js.gzip),
          kb(build.css.gzip),
          kb(build.js.gzip + build.css.gzip + build.html.gzip),
          kb(build.js.brotli + build.css.brotli + build.html.brotli),
          build.attribution.library ? `${kb(build.attribution.library)} / ${kb(build.attribution.libraryGzip)}` : "0",
          baseline ? kb(build.js.raw - baseline.js.raw) : "-",
          kb(firstLoad.total),
          `${kb(navigation.mean.total)} (${kb(navigation.worst.total)})`,
          `${firstLoad.cssRequests} / ${navigation.mean.cssRequests.toFixed(1)}`,
        ];
      }),
    );
    if (rows.some((build) => build.browser)) {
      output += `\nIn headless Chromium: unused CSS is the share of style rules a step added whose selector matches no rendered element; times are medians of ${runsOf(5)} runs.\n\n`;
      output += table(
        [
          "Library",
          "Unused CSS rules: first load / navigation mean / visit-all",
          "First load: rendered (ms)",
          "First load: style + layout (ms)",
          "Navigation mean: rendered (ms)",
          "Navigation mean: style + layout (ms)",
          `Style parity with ${REFERENCE}`,
        ],
        rows.map((build) => {
          const browser = build.browser;
          if (!browser) return [build.variant, "-", "-", "-", "-", "-", "-"];
          const [first, ...navigations] = browser.steps;
          const mean = (key: "renderedMs" | "styleMs" | "layoutMs") =>
            navigations.reduce((sum, step) => sum + step[key], 0) / (navigations.length || 1);
          const unused = (value: Unused) => pct(shareOf(value)?.rules);
          return [
            build.variant,
            `${unused(browser.unused.firstLoad)} / ${pct(browser.unused.navigation?.mean.rules)} / ${unused(browser.unused.visitAll)}`,
            ms(first!.renderedMs),
            (first!.styleMs + first!.layoutMs).toFixed(1),
            ms(mean("renderedMs")),
            (mean("styleMs") + mean("layoutMs")).toFixed(1),
            browser.parity ? pct(browser.parity.equal / browser.parity.compared) : "-",
          ];
        }),
      );
    }
    if (rows.some((build) => build.time)) {
      output += `\nUncached \`vp run\` builds, median (range) of ${runsOf(5)} runs, in seconds; the unstyled row is the floor that Vite+ and React set.\n\n`;
      output += table(
        ["Library", "Build"],
        rows.map((build) => [
          build.variant,
          build.time
            ? `${(build.time.median / 1000).toFixed(2)} (${(build.time.min / 1000).toFixed(2)}–${(build.time.max / 1000).toFixed(2)})`
            : "-",
        ]),
      );
    }
  }
  const stressed = builds.filter((build) => build.stress && build.routes === sizes[0]);
  if (stressed.length) {
    const first = stressed[0]!.stress!;
    output += `\n### Mounting and updating ${first.elements} styled elements\n\nIn headless Chromium, median of ${first.runs} runs, in ms: the whole call with the style and layout it forces, and the style recalculation and layout within it.\n\n`;
    output += table(
      ["Library", "Mount: total", "Mount: style + layout", "Update: total", "Update: style + layout"],
      stressed.map(({ variant, stress }) => [
        variant,
        stress!.mount.totalMs.toFixed(1),
        (stress!.mount.styleMs + stress!.mount.layoutMs).toFixed(1),
        stress!.update.totalMs.toFixed(1),
        (stress!.update.styleMs + stress!.update.layoutMs).toFixed(1),
      ]),
    );
  }
  return output;
}

process.stdout.write(markdown());
