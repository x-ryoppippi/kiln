import path from "node:path";
import { fileURLToPath } from "node:url";

import { rolldown } from "rolldown";
import { describe, expect, it } from "vite-plus/test";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const ENTRIES = ["index.ts", "core/index.ts", "jsx-runtime.ts", "jsx-dev-runtime.ts"];

// The compiler's dependencies are regular dependencies of `@nishikijs/react`, so only this keeps them out of client bundles.
describe("runtime entries", () => {
  it.each(ENTRIES)("%s reaches no compiler module or dependency", async (entry) => {
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

    expect(modules.size).toBeGreaterThan(0);
    for (const id of modules) {
      const local = path.relative(SRC, id);
      expect(local.startsWith("..") || local.startsWith("unplugin" + path.sep), id).toBe(false);
    }
    for (const id of packages) expect(id).toMatch(/^react(-dom)?(\/|$)/);
  });
});
