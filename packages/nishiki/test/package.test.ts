import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vite-plus/test";

describe("package.json", () => {
  it("publishes every entry the workspace exports", async () => {
    const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    const published = Object.fromEntries(
      Object.entries(manifest.exports as Record<string, unknown>).map(([entry, target]) => {
        if (typeof target !== "object" || target === null) return [entry, target];
        const { source: _, ...rest } = target as Record<string, unknown>;
        return [entry, rest];
      }),
    );
    expect(manifest.publishConfig.exports).toEqual(published);
  });
});
