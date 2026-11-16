import { describe, expect, it } from "vite-plus/test";

import { CACHED_BUNDLERS, rebuild } from "./helpers/rebuild.ts";

describe.each(CACHED_BUNDLERS)("%s's persistent cache", (bundler) => {
  // Each test starts a Node process that loads its bundler from scratch.
  it("does not replay modules cached with other options", { timeout: 30_000 }, async () => {
    const [runtime, extracted] = await rebuild(bundler);
    expect(runtime).toContain("color:red");
    expect(extracted).not.toContain("color:red");
  });
});
