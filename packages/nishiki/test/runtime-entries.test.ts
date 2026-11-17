import path from "node:path";
import { fileURLToPath } from "node:url";

import { rolldown } from "rolldown";
import { describe, expect, it } from "vite-plus/test";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const ENTRIES = ["index.ts", "core/index.ts", "jsx-runtime.ts", "jsx-dev-runtime.ts"];
const LEAN_ENTRIES = ["lean/index.ts", "lean/jsx-runtime.ts", "lean/jsx-dev-runtime.ts"];
// The runtime compiler, which `@nishikijs/react/lean` exists to leave out.
const COMPILER = ["core/compile.ts", "core/conditions.ts", "core/properties.ts"];

// The source modules, relative to src, and the packages an entry reaches.
async function reach(entry: string): Promise<{ modules: string[]; packages: Set<string> }> {
  const modules = new Set<string>();
  const packages = new Set<string>();
  const build = await rolldown({
    input: path.join(SRC, entry),
    external: (id) => {
      const bare = !id.startsWith(".") && !path.isAbsolute(id);
      if (bare) packages.add(id);
      return bare;
    },
    // As in the published build, which drops in-source tests.
    transform: { define: { "import.meta.vitest": "undefined" } },
    plugins: [{ name: "record", load: (id) => void modules.add(id) }],
  });
  await build.generate({ format: "es" });
  await build.close();
  return { modules: [...modules].map((id) => path.relative(SRC, id).split(path.sep).join("/")), packages };
}

// The compiler's dependencies are regular dependencies of `@nishikijs/react`, so only this keeps them out of client bundles.
describe("runtime entries", () => {
  it.each([...ENTRIES, ...LEAN_ENTRIES])("%s reaches no compiler module or dependency", async (entry) => {
    const { modules, packages } = await reach(entry);
    expect(modules.length).toBeGreaterThan(0);
    for (const id of modules) expect(id.startsWith("..") || id.startsWith("unplugin/"), id).toBe(false);
    for (const id of packages) expect(id).toMatch(/^react(-dom)?(\/|$)/);
  });

  it.each(LEAN_ENTRIES)("%s leaves out the runtime compiler, whatever a module imports from it", async (entry) => {
    const { modules } = await reach(entry);
    expect(modules.filter((id) => COMPILER.includes(id))).toEqual([]);
  });
});
