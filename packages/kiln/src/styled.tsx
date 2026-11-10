import * as React from "react";

import { resolve } from "./core/index.ts";
import { Styles } from "./styles.tsx";
import type { Styles as StyleInput } from "./types.ts";

const STYLED = Symbol.for("kiln.styled");

type StyleResolver<StyleProps> = (styleProps: StyleProps) => StyleInput;

type StyledProps<Props, StyleProps> = Omit<Props, keyof StyleProps> &
  StyleProps & { className?: string; css?: StyleInput };

/**
 * Create a component that forwards generated class names to `Component`.
 * Props read by a style resolver are treated as style props and not forwarded.
 */
export function styled<
  Component extends keyof React.JSX.IntrinsicElements | React.JSXElementConstructor<any>,
  StyleProps extends object = {},
>(
  Component: Component,
  styles?: StyleInput | StyleResolver<StyleProps>,
): React.FunctionComponent<StyledProps<React.ComponentProps<Component>, StyleProps>> {
  const wrapsStyled = typeof Component === "function" && STYLED in Component;

  function StyledComponent({
    className: classNameProp,
    css: cssProp,
    ...props
  }: StyledProps<React.ComponentProps<Component>, StyleProps>): React.ReactNode {
    let base: StyleInput;

    if (typeof styles === "function") {
      const accessed = new Set<string>();
      base = styles(
        new Proxy(props, {
          get(target, prop: string) {
            accessed.add(prop);
            return target[prop as keyof typeof target];
          },
        }) as StyleProps,
      );
      for (const prop of accessed) delete props[prop as keyof typeof props];
    } else {
      base = styles;
    }

    // A wrapped styled component merges these styles with its own per key; class names would only concatenate.
    if (wrapsStyled) {
      return React.createElement(Component, { ...props, className: classNameProp, css: [base, cssProp] });
    }

    const [className, rules] = resolve([base, cssProp]);
    const merged = classNameProp ? classNameProp + " " + className : className;

    return (
      <>
        {React.createElement(Component, { ...props, className: merged })}
        <Styles rules={rules} />
      </>
    );
  }

  return Object.assign(StyledComponent, { [STYLED]: true });
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;
  const { renderToString } = await import("react-dom/server");
  const { jsx } = await import("./jsx-runtime.ts");

  const classesOf = (html: string, tag: string) =>
    new Set(new RegExp(`<${tag} class="([^"]*)"`).exec(html)?.[1]?.split(" ") ?? []);
  const expected = (...styles: StyleInput[]) => new Set(resolve(styles)[0].split(" "));

  describe("styled", () => {
    it("merges base styles with the css prop per key", () => {
      const Button = styled("button", { color: "red", padding: 8 });
      const output = renderToString(jsx(Button, { css: { color: "blue" }, children: "go" }));
      expect(classesOf(output, "button")).toEqual(expected({ color: "blue", padding: 8 }));
      expect(output).not.toContain("color:red");
    });

    it("keeps style props from reaching the element", () => {
      const Box = styled("div", ({ tone }: { tone: "warm" | "cool" }) => ({ color: tone === "warm" ? "red" : "blue" }));
      const output = renderToString(jsx(Box, { tone: "cool" }));
      expect(output).toContain("color:blue");
      expect(output).not.toContain("tone=");
    });

    it("merges a styled component wrapping another per key", () => {
      const Base = styled("button", { color: "red", padding: 8 });
      const Blue = styled(Base, { color: "blue" });
      const output = renderToString(jsx(Blue, { css: { margin: 0 } }));
      expect(classesOf(output, "button")).toEqual(expected({ color: "blue", padding: 8, margin: 0 }));
      expect(output).not.toContain("color:red");
    });

    it("keeps style props of every layer from reaching the element", () => {
      const Base = styled("div", ({ size }: { size: number }) => ({ padding: size }));
      const Toned = styled(Base, ({ tone }: { tone: string }) => ({ color: tone }));
      const output = renderToString(jsx(Toned, { tone: "red", size: 4 }));
      expect(output).toContain("color:red");
      expect(output).toContain("padding:4px");
      expect(output).not.toMatch(/tone=|size=/);
    });

    it("forwards className to the wrapped component", () => {
      const Box = styled("div", { color: "red" });
      expect(renderToString(jsx(Box, { className: "own" }))).toMatch(/class="own k[0-9a-z]+"/);
    });
  });
}
