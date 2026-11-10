import * as React from "react";
import * as ReactJSXRuntime from "react/jsx-runtime";

import { resolve } from "./core/index.ts";
import { Styles } from "./styles.tsx";
import type { Styles as StyleInput } from "./types.ts";

type WithCSS<Props> = Props & { css?: StyleInput };

export namespace JSX {
  export type Element = React.JSX.Element;
  export type ElementType = React.JSX.ElementType;
  export type ElementClass = React.JSX.ElementClass;
  export type ElementAttributesProperty = React.JSX.ElementAttributesProperty;
  export type ElementChildrenAttribute = React.JSX.ElementChildrenAttribute;
  export type LibraryManagedAttributes<C, P> = React.JSX.LibraryManagedAttributes<C, P>;
  export type IntrinsicAttributes = React.JSX.IntrinsicAttributes;
  export type IntrinsicClassAttributes<T> = React.JSX.IntrinsicClassAttributes<T>;
  export type IntrinsicElements = {
    [Tag in keyof React.JSX.IntrinsicElements]: WithCSS<React.JSX.IntrinsicElements[Tag]>;
  };
}

export const Fragment: typeof ReactJSXRuntime.Fragment = ReactJSXRuntime.Fragment;

/** Replace a `css` prop on a host element with class names plus a sibling that inserts its rules. */
export function withCSS(
  factory: (type: React.ElementType, props: any, key?: React.Key) => React.ReactElement,
  type: React.ElementType,
  props: Record<string, any>,
  key?: React.Key,
): React.ReactElement {
  if (typeof type !== "string" || props.css == null) return factory(type, props, key);

  const { css: styles, ...rest } = props;
  const [className, rules] = resolve([styles]);
  rest.className = rest.className ? rest.className + " " + className : className;

  if (rules.length === 0) return factory(type, rest, key);

  return ReactJSXRuntime.jsxs(
    Fragment,
    { children: [factory(type, rest), React.createElement(Styles, { rules })] },
    key,
  );
}

export function jsx(type: React.ElementType, props: Record<string, any>, key?: React.Key): React.ReactElement {
  return withCSS(ReactJSXRuntime.jsx, type, props, key);
}

export function jsxs(type: React.ElementType, props: Record<string, any>, key?: React.Key): React.ReactElement {
  return withCSS(ReactJSXRuntime.jsxs, type, props, key);
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;
  const { renderToString } = await import("react-dom/server");
  const { LAYER_ORDER } = await import("./core/index.ts");

  const page = (body: React.ReactNode) =>
    renderToString(jsxs("html", { children: [jsx("head", {}), jsx("body", { children: body })] }));

  describe("css prop", () => {
    it("hoists rules into one precedence group, layer order first", () => {
      const output = page(jsx("div", { css: { color: "red", padding: 8 }, children: "hi" }));
      const [className] = resolve([{ color: "red", padding: 8 }]);
      expect(output).toContain(`class="${className}"`);
      expect(output).toMatch(/<style data-precedence="kiln"[^>]*>@layer k0,/);
      expect(output.indexOf(LAYER_ORDER)).toBeLessThan(output.indexOf("{color:red}"));
    });

    it("appends to an existing className", () => {
      const output = page(jsx("div", { className: "own", css: { color: "red" } }));
      expect(output).toMatch(/class="own k[0-9a-z]+"/);
    });

    it("leaves components and elements without css untouched", () => {
      const element = jsx("div", { id: "plain" });
      expect(element.type).toBe("div");
      const Component = (props: { css?: unknown }) => jsx("span", { "data-css": String(props.css != null) });
      expect(renderToString(jsx(Component, { css: { color: "red" } }))).toContain('data-css="true"');
    });
  });
}
