import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { brotliCompressSync, gzipSync } from "node:zlib";

const { values } = parseArgs({
  options: {
    time: { type: "boolean", default: false },
    runs: { type: "string", default: "3" },
    filter: { type: "string", multiple: true },
    json: { type: "boolean", default: false },
    routes: { type: "boolean", default: false },
  },
});
const runs = values.time ? Number(values.runs) : 1;
if (!Number.isInteger(runs) || runs < 1) throw new Error(`--runs must be a positive integer, got ${values.runs}`);

const root = path.resolve(import.meta.dirname, "..");
const examplesDir = path.join(root, "examples");

// Where a build writes what the browser loads, when that is not `dist-extract` for `build:extract` and `dist` otherwise.
const outputs: Record<string, string> = {
  // Next.js and TanStack Start write both builds to the same place, and also emit server code
  // that never reaches the browser, so only their client assets are measured.
  "nextjs#build": ".next/static",
  "nextjs#build:webpack": ".next/static",
  "nextjs#build:extract": ".next/static",
  "tanstack-start#build": "dist/client",
  "tanstack-start#build:extract": "dist/client",
  "lazy-routes#build:extract:single": "dist-extract-single",
};
const outputOf = (example: string, task: string) =>
  outputs[`${example}#${task}`] ?? (task === "build:extract" ? "dist-extract" : "dist");

type Sizes = { raw: number; gzip: number; brotli: number };
// CSS gzip sizes in bytes, following the load paths a Vite manifest records: the entry's static imports on first
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
};
type Row = {
  example: string;
  task: string;
  js: Sizes;
  css: Sizes;
  html: Sizes;
  routes: Routes | null;
  ms?: number;
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

const KILN_CLASS = /\.(k[0-9a-z]+)[{:[ ,]/g;

async function measureRoutes(out: string): Promise<Routes | null> {
  const manifestPath = path.join(out, ".vite/manifest.json");
  if (!existsSync(manifestPath)) return null;
  const manifest: Manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const chunk = (key: string) => {
    const entry = manifest[key];
    if (!entry) throw new Error(`${path.relative(root, manifestPath)} has no ${key}`);
    return entry;
  };

  const files = new Map<string, { gzip: number; classes: string[] }>();
  const fileOf = async (file: string) => {
    let measured = files.get(file);
    if (!measured) {
      const content = await readFile(path.join(out, file));
      // One entry per rule that names a class, so a selector list such as `.k1:hover,.k1:focus` counts once.
      const classes = Array.from(content.toString("utf8").matchAll(/([^{}]*)\{/g), ([, selector]) => [
        ...new Set(Array.from((selector + "{").matchAll(KILN_CLASS), (match) => match[1]!)),
      ]).flat();
      measured = { gzip: gzipSync(content, { level: 9 }).length, classes };
      files.set(file, measured);
    }
    return measured;
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
      for (const name of (await fileOf(file)).classes) {
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
  const navigations: { gzip: number; requests: number }[] = [];
  let firstLoadCss = 0;
  let dupRules = 0;
  // Every load path is walked, which grows exponentially with the depth of nested dynamic imports.
  // A dynamic import of a chunk loaded earlier on the path was already counted as a navigation from there.
  const walk = async (chunks: Set<string>, css: Set<string>, added: Set<string>) => {
    for (const file of css) visited.add(file);
    dupRules = Math.max(dupRules, await duplicatesIn(css));
    for (const target of new Set([...added].flatMap((key) => chunk(key).dynamicImports ?? []))) {
      if (chunks.has(target)) continue;
      const loading = new Set([...closureOf([target])].filter((key) => !chunks.has(key)));
      const fetched = new Set(cssOf(loading).filter((file) => !css.has(file)));
      navigations.push({ gzip: await gzipOf(fetched), requests: fetched.size });
      await walk(new Set([...chunks, ...loading]), new Set([...css, ...fetched]), loading);
    }
  };
  for (const entry of Object.keys(manifest).filter((key) => manifest[key]!.isEntry)) {
    const chunks = closureOf([entry]);
    const css = new Set([...cssOf(chunks), ...(await linkedBy(entry))]);
    firstLoadCss = Math.max(firstLoadCss, await gzipOf(css));
    await walk(chunks, css, chunks);
  }

  const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
  const gzips = navigations.map((navigation) => navigation.gzip);
  const requests = navigations.map((navigation) => navigation.requests);
  return {
    firstLoadCss,
    navigations: navigations.length,
    navCssMean: mean(gzips),
    navCssWorst: Math.max(0, ...gzips),
    navRequestsMean: mean(requests),
    navRequestsMin: navigations.length ? Math.min(...requests) : 0,
    navRequestsMax: Math.max(0, ...requests),
    visitAllCss: await gzipOf(visited),
    dupRules,
  };
}

// build:webpack is the baseline for Next.js, whose extract build has to use webpack.
const MEASURED_TASKS = ["build", "build:webpack", "build:extract", "build:extract:single"];

async function tasksOf(example: string): Promise<string[]> {
  const { default: config } = await import(pathToFileURL(path.join(examplesDir, example, "vite.config.ts")).href);
  return Object.keys(config.run?.tasks ?? {}).filter((task) => MEASURED_TASKS.includes(task));
}

const examples = (await readdir(examplesDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => !values.filter || values.filter.includes(name))
  .sort();

const rows: Row[] = [];
for (const example of examples) {
  for (const task of await tasksOf(example)) {
    process.stderr.write(`${example}#${task}\n`);
    const out = path.join(examplesDir, example, outputOf(example, task));
    // A cache hit restores the task's files over whatever an earlier build left behind.
    await rm(out, { recursive: true, force: true });
    const times: number[] = [];
    for (let run = 0; run < runs; run++) {
      const start = performance.now();
      vp(["run", ...(values.time ? ["--no-cache"] : []), `example-${example}#${task}`]);
      times.push(performance.now() - start);
    }
    if (!existsSync(out)) throw new Error(`${example}#${task} wrote nothing to ${path.relative(root, out)}`);
    rows.push({
      example,
      task,
      js: await measure(out, ".js"),
      css: await measure(out, ".css"),
      // Server-rendered pages carry runtime-inserted rules in their HTML.
      html: await measure(out, ".html"),
      routes: values.routes ? await measureRoutes(out) : null,
      ms: values.time ? times.sort((a, b) => a - b)[Math.floor(times.length / 2)] : undefined,
    });
  }
}

if (values.json) {
  process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
} else {
  const kb = (bytes: number) => (bytes / 1024).toFixed(2);
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
    );
  }
  if (values.time) header.push(`Build (median of ${runs})`);
  const lines = [header, header.map(() => "---")];
  for (const row of rows) {
    const total = totalOf(row, "gzip");
    const base = row.task.startsWith("build:extract")
      ? (rows.find((other) => other.example === row.example && other.task === "build:webpack") ??
        rows.find((other) => other.example === row.example && other.task === "build"))
      : undefined;
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
            ]
          : ["-", "-", "-", "-", "-"]),
      );
    }
    if (row.ms !== undefined) cells.push(`${(row.ms / 1000).toFixed(2)} s`);
    lines.push(cells);
  }
  process.stdout.write(lines.map((cells) => `| ${cells.join(" | ")} |`).join("\n") + "\n\nSizes in KiB.\n");
  if (values.routes) {
    process.stdout.write(
      "\nThe route columns follow each build's Vite manifest and show - without one. Splitting CSS across chunks can raise " +
        "the summed CSS total while lowering first-load and per-navigation bytes; that trade-off is intended.\n",
    );
  }
}
