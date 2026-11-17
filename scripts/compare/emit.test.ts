import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { lazyRoutes } from "../gen-lazy-routes.ts";
import { emit, LIBRARIES } from "./emit.ts";
import { attribute } from "./measure.ts";

describe("emit", () => {
  const app = lazyRoutes({ routes: 9, elements: 4 });

  it.each(Object.keys(LIBRARIES) as (keyof typeof LIBRARIES)[])("writes every module for %s", (name) => {
    const files = emit(LIBRARIES[name], app);
    const modules = [
      "App.tsx",
      "main.tsx",
      "routes/home.tsx",
      ...app.routes.map((route) => `routes/${route.name}.tsx`),
      ...app.ui.map((module) => `ui/${module.file}.tsx`),
    ];
    for (const module of modules) expect(files.has(module), module).toBe(true);
  });

  it("writes StyleX's shorthands as the longhands it keeps", () => {
    const button = emit(LIBRARIES.stylex, app).get("ui/Button.tsx")!;
    expect(button).toContain(`borderWidth: "1px", borderStyle: "solid", borderColor: "#d0d7de"`);
    expect(button).toContain(`backgroundColor: { "default": "#f6f8fa", ":hover": "#eaeef2" }`);
    expect(button).not.toMatch(/\bborder: /);
  });

  it("writes Tailwind borders as utilities that let a side win over the whole border", () => {
    const tabs = emit(LIBRARIES.tailwind, app).get("ui/Tabs.tsx")!;
    expect(tabs).toContain("border-b-2 border-b-transparent");
    expect(tabs).toContain("aria-[selected=true]:border-b-[#fd8c73]");
  });
});

describe("attribute", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(realpathSync(tmpdir()), "nishiki-compare-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("splits a chunk's bytes by the package that wrote them", async () => {
    mkdirSync(path.join(dir, "assets"));
    // `var a=1;` from react, `var b=2;` from a styling library, `var c=3;` from the app, and an unmapped prefix.
    writeFileSync(path.join(dir, "assets/index.js"), "/*x*/var a=1;var b=2;var c=3;");
    writeFileSync(
      path.join(dir, "assets/index.js.map"),
      JSON.stringify({
        version: 3,
        sources: [
          "../node_modules/.pnpm/react@19.3.1/node_modules/react/index.js",
          "../node_modules/.pnpm/stylis@4.3.6/node_modules/stylis/index.js",
          "../apps/8/src/App.tsx",
        ],
        // Columns 5, 13 and 21, in sources 0, 1 and 2.
        mappings: "KAAA,QCAA,QCAA",
      }),
    );
    await expect(attribute(dir)).resolves.toMatchObject({
      bundler: 5,
      react: 8,
      library: 8,
      app: 8,
      packages: { react: 8, stylis: 8, app: 8, bundler: 5 },
    });
  });
});
