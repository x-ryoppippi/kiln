import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

const script = path.join(import.meta.dirname, "gen-lazy-routes.ts");

function generate(out: string, routes: number) {
  const result = spawnSync(process.execPath, [script, "--routes", String(routes), "--elements", "4", "--out", out], {
    encoding: "utf8",
  });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
}

describe("gen-lazy-routes", () => {
  let out: string;
  beforeEach(() => {
    out = mkdtempSync(path.join(realpathSync(tmpdir()), "kiln-gen-"));
  });
  afterEach(() => rmSync(out, { recursive: true, force: true }));

  it("leaves files it does not write in the output directory", () => {
    mkdirSync(path.join(out, "routes", "nested"), { recursive: true });
    mkdirSync(path.join(out, "other"));
    for (const file of ["keep.txt", "keep.tsx", "routes/keep.ts", "routes/nested/keep.tsx", "other/keep.tsx"]) {
      writeFileSync(path.join(out, file), "keep");
    }
    generate(out, 9);
    for (const file of ["keep.txt", "keep.tsx", "routes/keep.ts", "routes/nested/keep.tsx", "other/keep.tsx"]) {
      expect(readFileSync(path.join(out, file), "utf8")).toBe("keep");
    }
  });

  it("removes the modules of an earlier run with more routes", () => {
    generate(out, 32);
    generate(out, 9);
    const routes = readdirSync(path.join(out, "routes")).filter((file) => file.endsWith(".tsx"));
    expect(routes).toHaveLength(10);
    expect(readdirSync(path.join(out, "ui"))).not.toContain("Widget4.tsx");
  });
});
