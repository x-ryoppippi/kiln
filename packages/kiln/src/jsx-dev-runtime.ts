import type * as React from "react";
import * as ReactJSXDevRuntime from "react/jsx-dev-runtime";

import { withCSS } from "./jsx-runtime.ts";

export { Fragment, type JSX } from "./jsx-runtime.ts";

export function jsxDEV(
  type: React.ElementType,
  props: Record<string, any>,
  key: React.Key | undefined,
  isStatic: boolean,
  source?: unknown,
  self?: unknown,
): React.ReactElement {
  return withCSS(
    (innerType, innerProps, innerKey) =>
      ReactJSXDevRuntime.jsxDEV(innerType, innerProps, innerKey, isStatic, source as any, self),
    type,
    props,
    key,
  );
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;
  const { renderToString } = await import("react-dom/server");
  const { resolve } = await import("./core/index.ts");

  describe("jsxDEV", () => {
    it("compiles the css prop like the production runtime and keeps the key", () => {
      const element = jsxDEV("div", { css: { color: "red" }, children: "hi" }, "k", false);
      expect(element.key).toBe("k");
      const output = renderToString(element);
      expect(output).toContain(`class="${resolve([{ color: "red" }])[0]}"`);
      expect(output).toContain("{color:red}");
    });

    it("leaves elements without css untouched", () => {
      const element = jsxDEV("div", { id: "x" }, undefined, false);
      expect(element.type).toBe("div");
      expect(element.props).toEqual({ id: "x" });
    });
  });
}
