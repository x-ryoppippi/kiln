import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { brotliCompressSync, gzipSync } from "node:zlib";

import {
  findChrome,
  launch,
  median,
  summariseRuns,
  type Browser,
  type BrowserResult,
  type Run,
  type Step,
} from "./bench/browser.ts";
import {
  rulesOf,
  shareOf,
  summarise,
  unusedOf,
  type Rule,
  type Share,
  type Unused,
  type UnusedSummary,
} from "./bench/css.ts";
import { serve, type Server } from "./bench/serve.ts";

const { values } = parseArgs({
  options: {
    time: { type: "boolean", default: false },
    runs: { type: "string" },
    filter: { type: "string", multiple: true },
    json: { type: "boolean", default: false },
    routes: { type: "boolean", default: false },
    browser: { type: "boolean", default: false },
  },
});
const runsOf = (fallback: number) => {
  const runs = Number(values.runs ?? fallback);
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`--runs must be a positive integer, got ${values.runs}`);
  return runs;
};
const timeRuns = values.time ? runsOf(3) : 0;
const browserRuns = values.browser ? runsOf(5) : 0;

const root = path.resolve(import.meta.dirname, "..");
const examplesDir = path.join(root, "examples");

// Where a build writes what the browser loads, when that is not `dist` for `build` and `dist-<rest of the task name>`
// otherwise, such as `dist-rollup-extract` for `build:rollup:extract`.
const outputs: Record<string, string> = {
  // Next.js and TanStack Start write both builds to the same place, and also emit server code
  // that never reaches the browser, so only their client assets are measured.
  "nextjs#build": ".next/static",
  "nextjs#build:webpack": ".next/static",
  "nextjs#build:extract": ".next/static",
  "tanstack-start#build": "dist/client",
  "tanstack-start#build:extract": "dist/client",
};
const outputOf = (example: string, task: string) =>
  outputs[`${example}#${task}`] ??
  (task === "build" ? "dist" : "dist-" + task.slice("build:".length).replaceAll(":", "-"));

type Sizes = { raw: number; gzip: number; brotli: number };
// CSS gzip sizes in bytes, following the load paths a Vite or kiln manifest records: the entry's static imports on first
// load, then one dynamic import per navigation, which fetches only the files not loaded on the way there.
// Each file is a separate response, so a size is the sum of each file's own gzip size, not the gzip of their union.
type Routes = {
  firstLoadCss: number;
  navigations: number;
  navCssMean: number;
  navCssWorst: number;
  navRequestsMean: number;
  navRequestsMin: number;
  navRequestsMax: number;
  visitAllCss: number;
  // Extra copies of a kiln rule among the files loaded on one path, within a file too, on the path with the most.
  dupRules: number;
  // Rules whose class no JS chunk loaded with them mentions.
  unused: UnusedSummary;
};
// Build times in milliseconds of uncached builds, without the packages they depend on.
type Time = { median: number; min: number; max: number; runs: number[] };
type Row = {
  example: string;
  task: string;
  js: Sizes;
  css: Sizes;
  html: Sizes;
  routes: Routes | null;
  time: Time | null;
  // Builds without a Vite manifest, or without --browser or a browser, have none.
  browser: BrowserResult | null;
};

const totalOf = (row: Row, key: keyof Sizes) => row.js[key] + row.css[key] + row.html[key];

function vp(args: string[]) {
  // On Windows `vp` is a .cmd shim, which Node only runs through a shell.
  const result = spawnSync("vp", args, { cwd: root, encoding: "utf8", shell: process.platform === "win32" });
  if (result.status !== 0) {
    process.stderr.write(result.stdout + result.stderr);
    throw new Error(`vp ${args.join(" ")} failed`);
  }
}

async function measure(dir: string, extension: string): Promise<Sizes> {
  const sizes: Sizes = { raw: 0, gzip: 0, brotli: 0 };
  const files = await readdir(dir, { recursive: true, withFileTypes: true });
  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith(extension)) continue;
    const content = await readFile(path.join(file.parentPath, file.name));
    sizes.raw += content.length;
    sizes.gzip += gzipSync(content, { level: 9 }).length;
    sizes.brotli += brotliCompressSync(content).length;
  }
  return sizes;
}

type Manifest = Record<
  string,
  { file: string; css?: string[]; imports?: string[]; dynamicImports?: string[]; isEntry?: boolean }
>;

// Vite's, and the one unplugin-kiln writes for Rollup and Rolldown, whose `css` already lists every sheet that loads with
// a chunk. Both key chunks the way their `imports` name them, so the walk below reads either.
const MANIFESTS = [".vite/manifest.json", ".kiln/manifest.json"];
const manifestOf = (out: string) => MANIFESTS.map((file) => path.join(out, file)).find((file) => existsSync(file));

async function measureRoutes(out: string): Promise<Routes | null> {
  const manifestPath = manifestOf(out);
  if (!manifestPath) return null;
  const manifest: Manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const chunk = (key: string) => {
    const entry = manifest[key];
    if (!entry) throw new Error(`${path.relative(root, manifestPath)} has no ${key}`);
    return entry;
  };

  const files = new Map<string, { gzip: number; rules: Rule[] }>();
  const fileOf = async (file: string) => {
    let measured = files.get(file);
    if (!measured) {
      const content = await readFile(path.join(out, file));
      measured = { gzip: gzipSync(content, { level: 9 }).length, rules: rulesOf(content.toString("utf8")) };
      files.set(file, measured);
    }
    return measured;
  };
  const rulesIn = async (css: Iterable<string>) => {
    const rules: Rule[] = [];
    for (const file of css) rules.push(...(await fileOf(file)).rules);
    return rules;
  };
  // Every token in a chunk's JS that could be a kiln class; a rule counts as used when its class is among them.
  const mentions = new Map<string, string[]>();
  const mentionedBy = async (keys: Iterable<string>) => {
    const used = new Set<string>();
    for (const key of keys) {
      const file = chunk(key).file;
      let tokens = mentions.get(file);
      if (!tokens) {
        tokens = (await readFile(path.join(out, file), "utf8")).match(/\bk[0-9a-z]+\b/g) ?? [];
        mentions.set(file, tokens);
      }
      for (const token of tokens) used.add(token);
    }
    return used;
  };
  const gzipOf = async (css: Iterable<string>) => {
    let total = 0;
    for (const file of css) total += (await fileOf(file)).gzip;
    return total;
  };
  const duplicatesIn = async (css: Iterable<string>) => {
    const seen = new Set<string>();
    let duplicates = 0;
    for (const file of css) {
      for (const { name } of (await fileOf(file)).rules) {
        if (seen.has(name)) duplicates++;
        else seen.add(name);
      }
    }
    return duplicates;
  };
  // Chunks and everything they import statically, which load together.
  const closureOf = (keys: Iterable<string>) => {
    const closure = new Set(keys);
    for (const member of closure) for (const imported of chunk(member).imports ?? []) closure.add(imported);
    return closure;
  };
  const cssOf = (keys: Iterable<string>) => [...keys].flatMap((key) => chunk(key).css ?? []);
  // An HTML entry also links sheets that no chunk lists, such as the one `build.cssCodeSplit: false` emits.
  // Their URLs are taken to be under the default base, `/`.
  const linkedBy = async (key: string) => {
    if (!key.endsWith(".html")) return [];
    const html = await readFile(path.join(out, key), "utf8");
    return Array.from(html.matchAll(/<link\b[^>]*>/g), ([tag]) => {
      const attribute = (name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
      return attribute("rel") === "stylesheet" ? attribute("href")?.replace(/^\//, "") : undefined;
    }).filter((href) => href !== undefined);
  };

  const visited = new Set<string>();
  const visitedChunks = new Set<string>();
  const navigations: { gzip: number; requests: number; unused: Unused }[] = [];
  let firstLoadCss = -1;
  let firstLoadUnused: Unused = unusedOf([], new Set());
  let dupRules = 0;
  // Every load path is walked, which grows exponentially with the depth of nested dynamic imports.
  // A dynamic import of a chunk loaded earlier on the path was already counted as a navigation from there.
  const walk = async (chunks: Set<string>, css: Set<string>, added: Set<string>) => {
    for (const file of css) visited.add(file);
    for (const key of chunks) visitedChunks.add(key);
    dupRules = Math.max(dupRules, await duplicatesIn(css));
    for (const target of new Set([...added].flatMap((key) => chunk(key).dynamicImports ?? []))) {
      if (chunks.has(target)) continue;
      const loading = new Set([...closureOf([target])].filter((key) => !chunks.has(key)));
      const fetched = new Set(cssOf(loading).filter((file) => !css.has(file)));
      navigations.push({
        gzip: await gzipOf(fetched),
        requests: fetched.size,
        // The route's own chunk closure, including chunks that were already loaded, is what it can render.
        unused: unusedOf(await rulesIn(fetched), await mentionedBy(closureOf([target]))),
      });
      await walk(new Set([...chunks, ...loading]), new Set([...css, ...fetched]), loading);
    }
  };
  for (const entry of Object.keys(manifest).filter((key) => manifest[key]!.isEntry)) {
    const chunks = closureOf([entry]);
    const css = new Set([...cssOf(chunks), ...(await linkedBy(entry))]);
    const gzip = await gzipOf(css);
    if (gzip > firstLoadCss) {
      firstLoadCss = gzip;
      firstLoadUnused = unusedOf(await rulesIn(css), await mentionedBy(chunks));
    }
    await walk(chunks, css, chunks);
  }

  const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
  const gzips = navigations.map((navigation) => navigation.gzip);
  const requests = navigations.map((navigation) => navigation.requests);
  return {
    firstLoadCss: Math.max(0, firstLoadCss),
    navigations: navigations.length,
    navCssMean: mean(gzips),
    navCssWorst: Math.max(0, ...gzips),
    navRequestsMean: mean(requests),
    navRequestsMin: navigations.length ? Math.min(...requests) : 0,
    navRequestsMax: Math.max(0, ...requests),
    visitAllCss: await gzipOf(visited),
    dupRules,
    unused: summarise(
      "static",
      firstLoadUnused,
      navigations.map((navigation) => navigation.unused),
      unusedOf(await rulesIn(visited), await mentionedBy(visitedChunks)),
    ),
  };
}

// build:webpack is the baseline for Next.js, whose extract build has to use webpack; build:rollup and build:rolldown
// build an example that Vite builds with another bundler.
const MEASURED_TASK = /^build(:webpack|:rollup|:rolldown)?(:extract(:single)?)?$/;

async function tasksOf(example: string): Promise<string[]> {
  const { default: config } = await import(pathToFileURL(path.join(examplesDir, example, "vite.config.ts")).href);
  return Object.keys(config.run?.tasks ?? {}).filter((task) => MEASURED_TASK.test(task));
}

const examples = (await readdir(examplesDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => !values.filter || values.filter.includes(name))
  .sort();

const chrome = values.browser ? findChrome() : undefined;
if (values.browser && !chrome) {
  process.stderr.write(
    "--browser: no Chrome or Chromium found on PATH or in its usual install location; set CHROME_PATH to use one. " +
      "Skipping the browser metrics.\n",
  );
}

const rows: Row[] = [];
// Builds a browser loads, copied aside before another task can write over the same directory.
const loaded = new Map<Row, string>();
const snapshots = await mkdtemp(path.join(tmpdir(), "kiln-bench-builds-"));
try {
  for (const example of examples) {
    // The browser needs only a page to load, but measures an example only if a manifest says it splits CSS, then every
    // build of it with a page, so that a split build has its runtime build beside it.
    const pages = new Map<Row, string>();
    let splits = false;
    for (const task of await tasksOf(example)) {
      process.stderr.write(`${example}#${task}\n`);
      const out = path.join(examplesDir, example, outputOf(example, task));
      // A cache hit restores the task's files over whatever an earlier build left behind.
      await rm(out, { recursive: true, force: true });
      // Also builds the packages the task depends on, so the timed builds below measure the example alone.
      vp(["run", `example-${example}#${task}`]);
      if (!existsSync(out)) throw new Error(`${example}#${task} wrote nothing to ${path.relative(root, out)}`);
      const row: Row = {
        example,
        task,
        js: await measure(out, ".js"),
        css: await measure(out, ".css"),
        // Server-rendered pages carry runtime-inserted rules in their HTML.
        html: await measure(out, ".html"),
        routes: values.routes ? await measureRoutes(out) : null,
        time: null,
        browser: null,
      };
      rows.push(row);
      const manifest = Boolean(manifestOf(out));
      splits ||= manifest;
      if (chrome && (manifest || existsSync(path.join(out, "index.html")))) {
        const snapshot = path.join(snapshots, `${rows.length}`);
        await cp(out, snapshot, { recursive: true });
        pages.set(row, snapshot);
      }
    }
    if (splits) for (const [row, snapshot] of pages) loaded.set(row, snapshot);
  }

  // Runs and timed builds go round the tasks in turn, so a machine that speeds up or slows down during the
  // benchmark shifts every task alike instead of favouring the tasks measured last.
  if (chrome && loaded.size) {
    const servers = new Map<Row, Server>();
    const runs = new Map<Row, Run[]>([...loaded.keys()].map((row) => [row, []]));
    let browser: Browser | undefined;
    try {
      for (const [row, snapshot] of loaded) servers.set(row, await serve(snapshot));
      browser = await launch(chrome);
      for (let run = 0; run < browserRuns; run++) {
        for (const row of loaded.keys()) {
          process.stderr.write(`${row.example}#${row.task}: browser run ${run + 1} of ${browserRuns}\n`);
          runs.get(row)!.push(await browser.run(servers.get(row)!));
        }
      }
    } finally {
      await browser?.close();
      for (const server of servers.values()) await server.close();
    }
    for (const row of loaded.keys()) row.browser = summariseRuns(`${row.example}#${row.task}`, runs.get(row)!);
  }
} finally {
  await rm(snapshots, { recursive: true, force: true });
}

if (timeRuns) {
  const times = new Map<Row, number[]>(rows.map((row) => [row, []]));
  for (let run = 0; run < timeRuns; run++) {
    for (const row of rows) {
      process.stderr.write(`${row.example}#${row.task}: timed build ${run + 1} of ${timeRuns}\n`);
      const start = performance.now();
      vp(["run", "--no-cache", "--ignore-depends-on", `example-${row.example}#${row.task}`]);
      times.get(row)!.push(performance.now() - start);
    }
  }
  for (const row of rows) {
    const runs = times.get(row)!;
    row.time = { median: median(runs), min: Math.min(...runs), max: Math.max(...runs), runs };
  }
}

if (values.json) {
  process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
} else {
  const kb = (bytes: number) => (bytes / 1024).toFixed(2);
  const measuredInBrowser = rows.some((row) => row.browser);
  const unusedCells = (unused: UnusedSummary) => {
    const of = (key: keyof Share) => {
      const cell = (share: Share | null) => (share ? (share[key] * 100).toFixed(0) : "-");
      return [
        cell(shareOf(unused.firstLoad)),
        cell(unused.navigation?.mean ?? null),
        cell(unused.navigation?.worst ?? null),
        cell(shareOf(unused.visitAll)),
      ].join(" / ");
    };
    return [of("rules"), of("bytes")];
  };
  const spread = (values: number[], digits: number) =>
    `${median(values).toFixed(digits)} (${Math.min(...values).toFixed(digits)}–${Math.max(...values).toFixed(digits)}) ms`;
  // CSS bytes and requests are the same in every run; times are the median over the runs, with their range.
  const stepCells = (perRun: Omit<Step, "label" | "unused">[]) => {
    const first = perRun[0]!;
    return [
      `${kb(first.cssGzip)} KiB, ${first.cssRequests.toFixed(1)}`,
      spread(
        perRun.map((step) => step.renderedMs),
        0,
      ),
      spread(
        perRun.map((step) => step.styleMs + step.layoutMs),
        1,
      ),
    ].join(", ");
  };
  const meanStep = (steps: Step[]) => {
    const mean = (key: "cssGzip" | "cssRequests" | "renderedMs" | "styleMs" | "layoutMs") =>
      steps.reduce((sum, step) => sum + step[key], 0) / steps.length;
    return {
      cssGzip: mean("cssGzip"),
      cssRequests: mean("cssRequests"),
      renderedMs: mean("renderedMs"),
      styleMs: mean("styleMs"),
      layoutMs: mean("layoutMs"),
    };
  };
  const header = [
    "Example",
    "Task",
    "JS",
    "JS gzip",
    "CSS",
    "CSS gzip",
    "HTML gzip",
    "Total gzip",
    "Total brotli",
    "extract vs runtime (gzip)",
  ];
  if (values.routes) {
    header.push(
      "First load CSS gzip",
      "Navigation CSS gzip (mean / worst)",
      "CSS requests per navigation (mean, range)",
      "Visit-all CSS gzip",
      "Duplicate rules on a path",
      "Unused kiln rules % (first load / navigation mean / worst / visit-all; static)",
      "Unused kiln rule bytes % (same; static)",
    );
  }
  if (measuredInBrowser) {
    header.push(
      `Browser first load (CSS gzip, requests, rendered, style + layout; median and range of ${browserRuns} runs)`,
      "Browser navigation mean (same)",
      "Unused kiln rules % (first load / navigation mean / worst / visit-all; browser)",
      "Unused kiln rule bytes % (same; browser)",
    );
  }
  if (values.time) header.push(`Build (median, range of ${timeRuns})`);
  const lines = [header, header.map(() => "---")];
  for (const row of rows) {
    const total = totalOf(row, "gzip");
    const bundler = row.task.replace(/:extract(:single)?$/, "");
    const baseOf = (task: string) => rows.find((other) => other.example === row.example && other.task === task);
    const base =
      bundler === row.task
        ? undefined
        : bundler === "build"
          ? (baseOf("build:webpack") ?? baseOf("build"))
          : baseOf(bundler);
    const delta = base ? `${total >= totalOf(base, "gzip") ? "+" : ""}${kb(total - totalOf(base, "gzip"))}` : "";
    const cells = [
      row.example,
      row.task,
      kb(row.js.raw),
      kb(row.js.gzip),
      kb(row.css.raw),
      kb(row.css.gzip),
      kb(row.html.gzip),
      kb(total),
      kb(totalOf(row, "brotli")),
      delta,
    ];
    if (values.routes) {
      const routes = row.routes;
      cells.push(
        ...(routes
          ? [
              kb(routes.firstLoadCss),
              `${kb(routes.navCssMean)} / ${kb(routes.navCssWorst)}`,
              `${routes.navRequestsMean.toFixed(1)}, ${routes.navRequestsMin}–${routes.navRequestsMax}`,
              kb(routes.visitAllCss),
              String(routes.dupRules),
              ...unusedCells(routes.unused),
            ]
          : ["-", "-", "-", "-", "-", "-", "-"]),
      );
    }
    if (measuredInBrowser) {
      const runs = row.browser?.runs;
      cells.push(
        ...(runs
          ? [
              stepCells(runs.map((run) => run.steps[0]!)),
              runs[0]!.steps.length > 1 ? stepCells(runs.map((run) => meanStep(run.steps.slice(1)))) : "-",
              ...unusedCells(row.browser!.unused),
            ]
          : ["-", "-", "-", "-"]),
      );
    }
    if (row.time) {
      const seconds = (ms: number) => (ms / 1000).toFixed(2);
      cells.push(`${seconds(row.time.median)} s (${seconds(row.time.min)}–${seconds(row.time.max)})`);
    }
    lines.push(cells);
  }
  process.stdout.write(lines.map((cells) => `| ${cells.join(" | ")} |`).join("\n") + "\n\nSizes in KiB.\n");
  if (values.routes) {
    process.stdout.write(
      "\nThe route columns follow each build's Vite or kiln manifest and show - without one. Splitting CSS across chunks can raise " +
        "the summed CSS total while lowering first-load and per-navigation bytes; that trade-off is intended.\n" +
        "Static unused shares count kiln rules the step loaded whose class no JS chunk loaded with them mentions; " +
        "a navigation that loads no kiln rule is left out of its mean and worst.\n",
    );
  }
  if (measuredInBrowser) {
    process.stdout.write(
      "\nBrowser unused shares count kiln rules the step added whose class is on no element the page renders. " +
        "The time ranges are within this invocation; differences smaller than them are noise.\n",
    );
  }
}
