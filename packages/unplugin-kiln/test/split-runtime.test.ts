// Runs Rollup's and Rolldown's split output as a page would, against a stand-in DOM whose stylesheets load a tick
// after they are linked, to check when each sheet loads relative to the code that needs it.
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { MANIFEST, type ManifestChunk, type Options } from "../src/index.ts";

const ROUTES = fileURLToPath(new URL("fixtures/routes/main.js", import.meta.url));
// An entry without rules of its own that imports a page with some.
const LAZY_ONLY = fileURLToPath(new URL("fixtures/lazy-only/main.js", import.meta.url));
// kiln's runtime as far as the fixture uses it: `css()` reports the classes it is given.
const RUNTIME = `export const __k = (entries) => entries;
export const css = (...entries) => globalThis.log.push("run " + entries.flat().map(([, name]) => name).join(" "));
`;

function stubRuntime() {
  return {
    name: "kiln-runtime",
    resolveId: (id: string) => (id === "kiln" ? "\0kiln-runtime" : null),
    load: (id: string) => (id === "\0kiln-runtime" ? RUNTIME : null),
  };
}

async function build(bundler: "rollup" | "rolldown", dir: string, input = ROUTES, extract: Options["extract"] = true) {
  if (bundler === "rollup") {
    const { rollup } = await import("rollup");
    const { default: kiln } = await import("../src/rollup.ts");
    const bundle = await rollup({ input, plugins: [stubRuntime(), kiln({ extract })] });
    await bundle.write({ dir, format: "es" });
    await bundle.close();
  } else {
    const { rolldown } = await import("rolldown");
    const { default: kiln } = await import("../src/rolldown.ts");
    const bundle = await rolldown({ input, plugins: [stubRuntime(), kiln({ extract })] });
    await bundle.write({ dir, format: "es" });
    await bundle.close();
  }
}

interface Link {
  rel: string;
  href: string;
  onload?: () => void;
}

// A page whose stylesheets load a tick after they are linked; `log` records links, loads and the classes code uses.
function page(dir: string) {
  const log: string[] = [];
  const links: Link[] = [];
  const base = pathToFileURL(dir + "/").href;
  vi.stubGlobal("log", log);
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("__kiln$css", undefined);
  vi.stubGlobal("document", {
    head: {
      append(link: Link) {
        const file = link.href.slice(base.length);
        log.push("link " + file);
        links.push(link);
        setTimeout(() => {
          log.push("loaded " + file);
          link.onload?.();
        });
      },
    },
    createElement: (): Link => ({ rel: "", href: "" }),
    querySelectorAll: () => links.filter((link) => link.rel === "stylesheet"),
  });
  return { log, links };
}

describe.each(["rollup", "rolldown"] as const)("%s output in a page", (bundler) => {
  afterEach(() => void vi.unstubAllGlobals());

  it("loads each chunk's sheet before it resolves, and starts it at the dynamic import", async () => {
    const dir = await mkdtemp(path.join(await realpath(tmpdir()), "kiln-runtime-"));
    try {
      await build(bundler, dir);
      const manifest: Record<string, ManifestChunk> = JSON.parse(await readFile(path.join(dir, MANIFEST), "utf8"));
      const sheet = (name: string) => {
        const [file, chunk] = Object.entries(manifest).find(([file]) => file.startsWith(name))!;
        return { file, css: chunk.css!.at(-1)! };
      };

      const { log, links } = page(dir);
      await import(pathToFileURL(path.join(dir, "main.js")).href);
      const main = sheet("main.js").css;
      expect(log.filter((entry) => !entry.startsWith("run "))).toEqual([`link ${main}`, `loaded ${main}`]);

      const routes = Reflect.get(globalThis, "routes") as Record<string, () => Promise<unknown>>;
      log.length = 0;
      const blog = sheet("blog").css;
      const loading = routes.blog!();
      expect(log).toEqual([`link ${blog}`]);
      await loading;
      expect(log.indexOf(`loaded ${blog}`)).toBeGreaterThan(0);
      expect(log.indexOf(`loaded ${blog}`)).toBeLessThan(log.length - 1);
      expect(log.at(-1)).toMatch(/^run /);

      log.length = 0;
      await routes.about!();
      const about = sheet("about").css;
      expect(log.filter((entry) => !entry.startsWith("run "))).toEqual([`link ${about}`, `loaded ${about}`]);
      expect(log.at(-1)).toMatch(/^run /);

      expect(new Set(links.map((link) => link.href)).size).toBe(links.length);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("defines the loader in an entry whose single sheet holds only rules it imports dynamically", async () => {
    const dir = await mkdtemp(path.join(await realpath(tmpdir()), "kiln-runtime-"));
    try {
      await build(bundler, dir, LAZY_ONLY, { split: "single" });
      const manifest: Record<string, ManifestChunk> = JSON.parse(await readFile(path.join(dir, MANIFEST), "utf8"));
      const [sheet] = manifest["main.js"]!.css!;
      const { log } = page(dir);
      await import(pathToFileURL(path.join(dir, "main.js")).href);
      expect(log).toEqual([`link ${sheet}`, `loaded ${sheet}`]);
      await (Reflect.get(globalThis, "page") as () => Promise<unknown>)();
      expect(log.slice(2)).toEqual([expect.stringMatching(/^run /)]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
