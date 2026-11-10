import * as React from "react";

import { resolve } from "./core/index.ts";
import { Styles } from "./styles.tsx";
import type { Styles as StyleInput } from "./types.ts";

/**
 * Generate atomic class names from style objects, later arguments winning per top-level key.
 * @returns The class names and a component that renders the rules they need.
 */
export function css(...styles: StyleInput[]): [className: string, Styles: () => React.ReactNode] {
  const [className, rules] = resolve(styles);
  return [className, () => React.createElement(Styles, { rules })];
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;
  const { renderToString } = await import("react-dom/server");
  const { compileEntry, compiled } = await import("./core/index.ts");

  const render = (Component: () => React.ReactNode) => renderToString(React.createElement(Component));

  describe("css", () => {
    it("merges several inputs per key, later inputs winning", () => {
      const [className, Styles] = css({ color: "red", margin: 0 }, null, [{ color: "blue" }, false], { padding: 4 });
      expect(className).toBe(resolve([{ color: "blue", margin: 0, padding: 4 }])[0]);
      const output = render(Styles);
      for (const rule of ["{color:blue}", "{margin:0px}", "{padding:4px}"]) expect(output).toContain(rule);
      expect(output).not.toContain("color:red");
    });

    it("accepts compiled styles with a runtime part", () => {
      const input = compiled([compileEntry("color", "red")], { color: "blue", margin: 0 });
      expect(css(input, { padding: 1 })[0]).toBe(resolve([{ color: "red", margin: 0, padding: 1 }])[0]);
    });

    it("returns no class names and renders nothing for empty input", () => {
      for (const inputs of [[], [{}], [null, false, undefined], [{ color: null }]] as const) {
        const [className, Styles] = css(...inputs);
        expect(className).toBe("");
        expect(render(Styles)).toBe("");
      }
    });
  });
}
