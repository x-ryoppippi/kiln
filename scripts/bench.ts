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
  },
});
const runs = values.time ? Number(values.runs) : 1;
if (!Number.isInteger(runs) || runs < 1) throw new Error(`--runs must be a positive integer, got ${values.runs}`);

const root = path.resolve(import.meta.dirname, "..");
const examplesDir = path.join(root, "examples");

// Next.js and TanStack Start write both builds to the same place, and also emit server code
// that never reaches the browser, so only their client assets are measured.
const clientOutput: Record<string, (task: string) => string> = {
  nextjs: () => ".next/static",
  "tanstack-start": () => "dist/client",
};
const defaultOutput = (task: string) => (task === "build:extract" ? "dist-extract" : "dist");

type Sizes = { raw: number; gzip: number; brotli: number };
type Row = { example: string; task: string; js: Sizes; css: Sizes; ms?: number };

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

// build:webpack is the baseline for Next.js, whose extract build has to use webpack.
const MEASURED_TASKS = ["build", "build:webpack", "build:extract"];

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
    const out = path.join(examplesDir, example, (clientOutput[example] ?? defaultOutput)(task));
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
    "Total gzip",
    "Total brotli",
    "extract vs runtime (gzip)",
  ];
  if (values.time) header.push(`Build (median of ${runs})`);
  const lines = [header, header.map(() => "---")];
  for (const row of rows) {
    const total = row.js.gzip + row.css.gzip;
    const base =
      row.task === "build:extract"
        ? (rows.find((other) => other.example === row.example && other.task === "build:webpack") ??
          rows.find((other) => other.example === row.example && other.task === "build"))
        : undefined;
    const delta = base
      ? `${total >= base.js.gzip + base.css.gzip ? "+" : ""}${kb(total - base.js.gzip - base.css.gzip)}`
      : "";
    const cells = [
      row.example,
      row.task,
      kb(row.js.raw),
      kb(row.js.gzip),
      kb(row.css.raw),
      kb(row.css.gzip),
      kb(total),
      kb(row.js.brotli + row.css.brotli),
      delta,
    ];
    if (row.ms !== undefined) cells.push(`${(row.ms / 1000).toFixed(2)} s`);
    lines.push(cells);
  }
  process.stdout.write(lines.map((cells) => `| ${cells.join(" | ")} |`).join("\n") + "\n\nSizes in KiB.\n");
}
