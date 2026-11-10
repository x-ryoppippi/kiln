import * as React from "react";

import { resolve } from "./core/index.ts";
import { Styles } from "./styles.tsx";
import type { Styles as StyleInput } from "./types.ts";

const STYLED = Symbol.for("kiln.styled");

/** Props whose names start with `$` style the component and are never forwarded to an element. */
export type StyleProps = { [key: `$${string}`]: unknown };

type StyleResolver<Style, Props> = (styleProps: Style, props: Props) => StyleInput;

type StyledProps<Props, Style> = Props & Style & { className?: string; css?: StyleInput };

const DOLLAR = 36;

/**
 * Create a component that forwards generated class names to `Component`.
 * A style resolver receives the `$`-prefixed style props and the other props; style props are not forwarded.
 */
export function styled<
  Component extends keyof React.JSX.IntrinsicElements | React.JSXElementConstructor<any>,
  Style extends StyleProps = {},
>(
  Component: Component,
  styles?: StyleInput | StyleResolver<Style, React.ComponentProps<Component>>,
): React.FunctionComponent<StyledProps<React.ComponentProps<Component>, Style>> {
  const wrapsStyled = typeof Component === "function" && STYLED in Component;

  function StyledComponent({
    className: classNameProp,
    css: cssProp,
    ...props
  }: StyledProps<React.ComponentProps<Component>, Style>): React.ReactNode {
    const styleProps: Record<string, unknown> = {};
    const forwarded: Record<string, unknown> = {};
    for (const key in props) {
      const value = (props as Record<string, unknown>)[key];
      const isStyleProp = key.charCodeAt(0) === DOLLAR;
      if (isStyleProp) styleProps[key] = value;
      // A wrapped styled component may read style props of its own, so they travel down to the innermost one.
      if (!isStyleProp || wrapsStyled) forwarded[key] = value;
    }

    const base =
      typeof styles === "function" ? styles(styleProps as Style, forwarded as React.ComponentProps<Component>) : styles;

    // A wrapped styled component merges these styles with its own per key; class names would only concatenate.
    if (wrapsStyled) {
      return React.createElement(Component, { ...forwarded, className: classNameProp, css: [base, cssProp] });
    }

    const [className, rules] = resolve([base, cssProp]);
    const merged = className ? (classNameProp ? classNameProp + " " + className : className) : classNameProp;

    return (
      <>
        {React.createElement(Component, { ...forwarded, className: merged })}
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
  const { compileEntry, compiled } = await import("./core/index.ts");

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
      const Box = styled("div", ({ $tone }: { $tone: "warm" | "cool" }) => ({
        color: $tone === "warm" ? "red" : "blue",
      }));
      const output = renderToString(jsx(Box, { $tone: "cool" }));
      expect(output).toContain("color:blue");
      expect(output).not.toContain("tone=");
    });

    it("drops style props the resolver does not read, on every branch", () => {
      const Box = styled("div", ({ $loud, $tone }: { $loud: boolean; $tone: string }) =>
        $loud ? { color: $tone } : { margin: 0 },
      );
      expect(renderToString(jsx(Box, { $loud: false, $tone: "red", id: "x" }))).toMatch(
        /<div id="x" class="k[0-9a-z]+"><\/div>$/,
      );
    });

    it("passes the other props to the resolver and still forwards them", () => {
      const Link = styled("a", (_: {}, props) => ({ color: props.href ? "blue" : "gray" }));
      const output = renderToString(jsx(Link, { href: "/x" }));
      expect(output).toContain("color:blue");
      expect(output).toContain('href="/x"');
    });

    it("merges a styled component wrapping another per key", () => {
      const Base = styled("button", { color: "red", padding: 8 });
      const Blue = styled(Base, { color: "blue" });
      const output = renderToString(jsx(Blue, { css: { margin: 0 } }));
      expect(classesOf(output, "button")).toEqual(expected({ color: "blue", padding: 8, margin: 0 }));
      expect(output).not.toContain("color:red");
    });

    it("keeps style props of every layer from reaching the element", () => {
      const Base = styled("div", ({ $size }: { $size: number }) => ({ padding: $size }));
      const Toned = styled(Base, ({ $tone }: { $tone: string }) => ({ color: $tone }));
      const output = renderToString(jsx(Toned, { $tone: "red", $size: 4 }));
      expect(output).toContain("color:red");
      expect(output).toContain("padding:4px");
      expect(output).not.toMatch(/tone=|size=/);
    });

    it("forwards className to the wrapped component", () => {
      const Box = styled("div", { color: "red" });
      expect(renderToString(jsx(Box, { className: "own" }))).toMatch(/class="own k[0-9a-z]+"/);
    });

    const page = (body: React.ReactNode) =>
      renderToString(jsx("html", { children: [jsx("head", {}), jsx("body", { children: body })] }));

    it("renders nested styled components with all rules hoisted into one precedence group", () => {
      const Card = styled("section", { padding: 16, ":hover": { color: "red" } });
      const Title = styled("h1", { margin: 0, color: "blue" });
      const output = page(
        jsx(Card, { children: [jsx(Title, { children: "a" }, "a"), jsx(Title, { children: "b" }, "b")] }),
      );
      expect(classesOf(output, "section")).toEqual(expected({ padding: 16, ":hover": { color: "red" } }));
      expect(output.match(/<h1 class="([^"]+)">/g)).toHaveLength(2);
      expect(output.match(/<style /g)).toHaveLength(1);
      const [head] = output.split("<body>");
      for (const rule of ["{padding:16px}", ":hover{color:red}", "{margin:0px}", "{color:blue}"]) {
        expect(head).toContain(rule);
      }
      expect(head!.split("{color:blue}")).toHaveLength(2);
    });

    it("forwards other props and children to the element", () => {
      const Link = styled("a", { color: "red" });
      const output = renderToString(jsx(Link, { href: "/x", "aria-label": "go", children: "go" }));
      expect(output).toMatch(/<a href="\/x" aria-label="go" class="k[0-9a-z]+">go<\/a>/);
    });

    it("passes className to a custom component", () => {
      const Label = ({ className, text }: { className?: string; text: string }) =>
        jsx("span", { className, "data-text": text });
      const Styled = styled(Label, { color: "red" });
      expect(renderToString(jsx(Styled, { text: "hi" }))).toMatch(/<span class="k[0-9a-z]+" data-text="hi"><\/span>/);
    });

    it("accepts compiled styles, nested lists and resolvers returning them", () => {
      const red = compiled([compileEntry("color", "red")]);
      const Fixed = styled("p", [red, { margin: 0 }]);
      expect(classesOf(renderToString(jsx(Fixed, {})), "p")).toEqual(expected({ color: "red", margin: 0 }));

      const Toned = styled("p", ({ $loud }: { $loud: boolean }) => [red, $loud && { fontWeight: 700 }]);
      expect(classesOf(renderToString(jsx(Toned, { $loud: true })), "p")).toEqual(
        expected({ color: "red", fontWeight: 700 }),
      );
      expect(renderToString(jsx(Toned, { $loud: false }))).not.toContain("font-weight");
    });

    it("lets style props that are not passed fall back inside the resolver", () => {
      const Box = styled("div", ({ $size = 2 }: { $size?: number }) => ({ padding: $size }));
      expect(renderToString(jsx(Box, {}))).toContain("{padding:2px}");
    });

    it("renders no style without styles", () => {
      expect(renderToString(jsx(styled("div"), { id: "x" }))).not.toContain("<style");
      expect(renderToString(jsx(styled("div", { color: null }), { id: "x" }))).not.toContain("<style");
    });

    it("leaves no empty class or trailing space behind without styles", () => {
      expect(renderToString(jsx(styled("div"), { id: "x" }))).toBe('<div id="x"></div>');
      expect(renderToString(jsx(styled("div", { color: null }), { className: "own" }))).toBe('<div class="own"></div>');
    });
  });
}
