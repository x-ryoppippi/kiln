import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const OPTIONS = { breakpoints: ["600px", "900px"], order: [":focus", ":hover"] };
const KEY = "@media (min-width: 900px)";
const VALUE = { ":hover": { color: "red" } };

// Each test loads its own instance of the runtime, as an app that has only just started.
const lean = () => import("../src/lean/index.ts");
const compiler = () => import("../src/compiler.ts");

// What the runtime ranks with: its conditions, its layer statement, and the rules it compiles at runtime.
async function ranking() {
  const { conditionOptions, layerOrder } = await import("../src/core/config.ts");
  const { compileEntry } = await import("../src/core/compile.ts");
  return { options: conditionOptions(), layerOrder: layerOrder(), entries: compileEntry(KEY, VALUE) };
}

async function rankingWith(options: object) {
  const { createTable } = await import("../src/core/conditions.ts");
  const { layerName, layerStatement } = await import("../src/core/config.ts");
  const { compileEntry } = await import("../src/core/compile.ts");
  const table = createTable(options);
  return {
    options,
    layerOrder: layerStatement(Array.from({ length: 2 * table.size + 1 }, (_, rank) => layerName(rank))),
    entries: compileEntry(KEY, VALUE, { table }),
  };
}

describe("configure from @nishikijs/react/lean", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("applies conditions configured before the compiler loads once it does", async () => {
    (await lean()).configure(OPTIONS);
    await compiler();
    expect(await ranking()).toEqual(await rankingWith(OPTIONS));
  });

  it("applies conditions configured after the compiler loads at once", async () => {
    const { configure } = await lean();
    await compiler();
    configure(OPTIONS);
    expect(await ranking()).toEqual(await rankingWith(OPTIONS));
  });

  it("applies only the conditions configured last before the compiler loads", async () => {
    const { configure } = await lean();
    configure({ breakpoints: ["300px"] });
    configure(OPTIONS);
    await compiler();
    expect(await ranking()).toEqual(await rankingWith(OPTIONS));
  });

  it("leaves the layers the build plugin set without the compiler, which alone ranks conditions", async () => {
    const { __c, configure, layerOrder } = await lean();
    const { conditionOptions } = await import("../src/core/config.ts");
    const built = { breakpoints: ["700px"] };
    __c(built, 33);
    const before = layerOrder();
    expect(() => configure(OPTIONS)).not.toThrow();
    expect(conditionOptions()).toBe(built);
    expect(layerOrder()).toBe(before);
  });
});
