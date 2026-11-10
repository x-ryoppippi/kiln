import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

const ROOT = fileURLToPath(new URL("../../../examples/tanstack-router/", import.meta.url));

async function buildExample() {
  const extract = process.env.KILN_EXTRACT;
  process.env.KILN_EXTRACT = "1";
  // Imported rather than passed as `configFile`, so `unplugin-kiln` resolves to its source under the test's conditions.
  const { default: config } = await import(ROOT + "vite.config.ts").finally(() => {
    if (extract === undefined) delete process.env.KILN_EXTRACT;
    else process.env.KILN_EXTRACT = extract;
  });
  const { build } = await import("vite-plus");
  const result = await build({
    ...config,
    configFile: false,
    logLevel: "silent",
    root: ROOT,
    // kiln's runtime would otherwise be bundled from its build output, which tests must not need.
    build: { ...config.build, manifest: true, write: false, rollupOptions: { external: /^kiln(\/|$)/ } },
  });
  const output = (Array.isArray(result) ? result : [result]).flatMap((item: any) => item.output);
  return new Map<string, string>(
    output.map((file: any) => [
      file.fileName,
      file.type === "chunk"
        ? file.code
        : typeof file.source === "string"
          ? file.source
          : new TextDecoder().decode(file.source),
    ]),
  );
}

const classes = (css: string) => new Set(css.match(/\.k[0-9a-z]+(?=[{:[ ,])/g)?.map((name) => name.slice(1)));
// An entry whose rules kiln extracted keeps only its key and class name: `[key, "k…", []]`, in any quotes.
const referenced = (js: string) =>
  new Set(Array.from(js.matchAll(/["'`](k[0-9a-z]+)["'`],\[\]\]/g), (match) => match[1]!));

describe("tanstack-router example", async () => {
  const files = await buildExample();
  const manifest: Record<string, { file: string; css?: string[] }> = JSON.parse(files.get(".vite/manifest.json")!);
  const sheet = (key: string) => classes((manifest[key]!.css ?? []).map((name) => files.get(name)!).join("\n"));
  const entry = { js: referenced(files.get(manifest["index.html"]!.file)!), css: sheet("index.html") };
  const splits = Object.keys(manifest).filter((key) => key.includes("?tsr-split="));

  it("splits the routes' components, including a route with an errorComponent", () => {
    expect(splits).toEqual(
      expect.arrayContaining([
        "src/routes/about.tsx?tsr-split=component",
        "src/routes/team.tsx?tsr-split=component",
        "src/routes/team.tsx?tsr-split=errorComponent",
      ]),
    );
  });

  it.each(splits)("loads a rule for every class %s references", (key) => {
    const own = referenced(files.get(manifest[key]!.file)!);
    expect(own.size).toBeGreaterThan(0);
    const loaded = new Set([...entry.css, ...sheet(key)]);
    expect([...own].filter((name) => !loaded.has(name))).toEqual([]);
  });

  it.each(splits)("keeps the rules only %s uses out of the entry sheet", (key) => {
    const only = [...referenced(files.get(manifest[key]!.file)!)].filter((name) => !entry.js.has(name));
    expect(only.filter((name) => entry.css.has(name))).toEqual([]);
  });
});
