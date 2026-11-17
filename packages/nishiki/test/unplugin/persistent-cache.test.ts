import { describe, expect, it } from "vite-plus/test";

import { CACHED_BUNDLERS, rebuild } from "./helpers/rebuild.ts";

describe.each(CACHED_BUNDLERS)("%s's persistent cache", (bundler) => {
  // Each test starts a Node process that loads its bundler from scratch.
  it("does not replay modules cached with other options", { timeout: 30_000 }, async () => {
    const [runtime, extracted] = await rebuild(bundler);
    // webpack's development output escapes each module's source into a string.
    const [runtimeCode, extractedCode] = [runtime, extracted].map((code) => code.replaceAll("\\", ""));
    expect(runtimeCode).toMatch(/\[\s*["'`]color["'`]\s*,\s*\[\s*["'`]red["'`]/);
    expect(extractedCode).not.toMatch(/["'`]red["'`]/);
  });
});
