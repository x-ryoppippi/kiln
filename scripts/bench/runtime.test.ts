import { describe, expect, it } from "vite-plus/test";

import { measureRuntime } from "./runtime.ts";

// gzip bytes, a little above the current sizes. Raise one only in the change that needs the bytes, so a regression
// shows up in review instead of in every app.
const BUDGET = { full: 5850, lean: 2150, leanExtract: 1800 };

describe("nishiki's runtime", () => {
  it("stays within its gzip budget, full and lean", async () => {
    const { js, lean, leanExtract } = await measureRuntime();
    expect(js.gzip, "@nishikijs/react and its JSX runtime").toBeLessThanOrEqual(BUDGET.full);
    expect(lean?.gzip, "@nishikijs/react/lean and its JSX runtime").toBeLessThanOrEqual(BUDGET.lean);
    expect(leanExtract?.gzip, "the same with extract").toBeLessThanOrEqual(BUDGET.leanExtract);
  });
});
