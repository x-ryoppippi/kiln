import { describe, expect, it } from "vite-plus/test";

import { CACHED_BUNDLERS, rebuild } from "./helpers/rebuild.ts";

describe.each(CACHED_BUNDLERS)("%s's persistent cache", (bundler) => {
  // Each build starts a Node process that loads its bundler from scratch.
  it("does not replay modules cached with other options", { timeout: 30_000 }, async () => {
    const [runtime, extracted] = await rebuild(bundler, [{ extract: false }, { extract: true }]);
    // webpack's development output escapes each module's source into a string.
    const [runtimeCode, extractedCode] = [runtime!, extracted!].map(({ code }) => code.replaceAll("\\", ""));
    expect(runtimeCode).toMatch(/\[\s*["'`]color["'`]\s*,\s*\[\s*["'`]red["'`]/);
    expect(extractedCode).not.toMatch(/["'`]red["'`]/);
    expect(extracted!.transformed).toBe(true);
  });

  it("replays modules cached by the same build of nishiki, but not by another", { timeout: 30_000 }, async () => {
    const builds = await rebuild(bundler, [{ version: "1.0.0+a" }, { version: "1.0.0+a" }, { version: "1.0.0+b" }]);
    expect(builds.map(({ transformed }) => transformed)).toEqual([true, false, true]);
  });
});
