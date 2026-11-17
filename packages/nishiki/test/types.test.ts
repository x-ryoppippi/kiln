import { describe, expect, it } from "vite-plus/test";

import type { CSSObject } from "../src/types.ts";

// `vp check` type-checks this file, which is where these assertions bite.
describe("CSSObject", () => {
  it("accepts the at-rules that hold style rules and rejects the others", () => {
    const styles: CSSObject[] = [
      {
        "@media (min-width: 40rem)": { color: "red" },
        "@supports (display: grid)": { display: "grid" },
        "@container (width > 30rem)": { padding: 1 },
        "@scope (.card)": { margin: 0 },
        "@starting-style": { opacity: 0 },
        "@layer base": { color: "blue" },
      },
      // @ts-expect-error @keyframes holds keyframes, not styles for the element.
      { "@keyframes spin": { from: { rotate: "0deg" } } },
      // @ts-expect-error @font-face holds descriptors.
      { "@font-face": { fontFamily: "Inter" } },
      // @ts-expect-error @property holds descriptors.
      { "@property --x": { inherits: "false" } },
      // @ts-expect-error @page holds page margins and descriptors.
      { "@page": { margin: 0 } },
    ];
    expect(styles).toHaveLength(5);
  });
});
