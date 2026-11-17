import { describe, expect, it } from "vite-plus/test";

import { compiled, compileEntry, layerOrder, resolve, type StyleInput } from "../../src/core/index.ts";
import { computed, declarationsOf, type ElementState } from "./cascade.ts";
import { expected, type Style } from "./spec.ts";
import { random, randomCompound, randomState, randomStyle, shuffled } from "./vocabulary.ts";

const CASES = Number(process.env.NISHIKI_ORACLE_CASES ?? 400);

const state = (overrides: Partial<ElementState> = {}): ElementState => ({
  classes: new Set(["x"]),
  width: 1000,
  ...overrides,
});

describe("the cascade oracle", () => {
  it("orders layers by first appearance, and a layer's own rules above its sublayers", () => {
    const sheets = [
      "@layer b,a;",
      "@layer a{.x{color:red}}",
      "@layer b{.x.x.x{color:blue}}",
      "@layer a.inner{.x{padding:1px}}",
      "@layer a{.x{padding-left:2px}}",
      "@layer a.inner{.x{padding-left:3px}}",
    ];
    expect(computed(sheets, state())).toMatchObject({ color: "red", "padding-left": "2px", "padding-top": "1px" });
  });

  it("breaks ties within a layer by specificity, then document order", () => {
    expect(computed(["@layer a{.x:hover{color:red}.x{color:blue}}"], state({ pseudo: new Set(["hover"]) }))).toEqual({
      color: "red",
    });
    expect(computed(["@layer a{.x{color:red}.x{color:blue}}"], state())).toEqual({ color: "blue" });
    expect(computed(["@layer a{.x{color:red}}", "@layer a{.x{color:green}}"], state())).toEqual({ color: "green" });
  });

  it("evaluates width queries, media features, attributes, ancestors and pseudo-classes", () => {
    const css = [
      "@layer a{@media (min-width: 40rem){.x{color:red}}@media (width < 600px){.x{padding:1px 2px}}}",
      '@layer b{@media (prefers-color-scheme: dark){.x[aria-selected="true"]{margin:3px}}.dark .x{margin-left:4px}}',
      "@layer c{.x::before{color:blue}.x span{color:green}}",
    ];
    expect(computed(css, state({ width: 500 }))).toEqual({
      "padding-bottom": "1px",
      "padding-left": "2px",
      "padding-right": "2px",
      "padding-top": "1px",
    });
    const dark = state({
      width: 640,
      media: new Set(["prefers-color-scheme: dark"]),
      attributes: { "aria-selected": "true" },
      ancestors: new Set(["dark"]),
    });
    expect(computed(css, dark)).toEqual({
      color: "red",
      "margin-bottom": "3px",
      "margin-left": "4px",
      "margin-right": "3px",
      "margin-top": "3px",
    });
  });

  it("keeps strings and brackets whole in declaration values", () => {
    expect(computed(['@layer a{.x{color:var(--a, ";}");padding-left:1px}}'], state())).toEqual({
      color: '";}"',
      "padding-left": "1px",
    });
  });

  it("puts the style attribute above every rule, layered or not", () => {
    const style = { color: "green", "padding-left": "3px" };
    expect(computed(["@layer a{.x{color:red}}", ".x.x{color:blue;padding:1px}"], state({ style }))).toEqual({
      color: "green",
      "padding-bottom": "1px",
      "padding-left": "3px",
      "padding-right": "1px",
      "padding-top": "1px",
    });
  });

  it("substitutes custom properties, from the element or its parent, before expanding shorthands", () => {
    const css = ["@layer a{.x{padding:var(--p);color:var(--c, var(--d, red))}}"];
    expect(computed(css, state({ style: { "--p": "1px 2px" } }))).toEqual({
      "--p": "1px 2px",
      color: "red",
      "padding-bottom": "1px",
      "padding-left": "2px",
      "padding-right": "2px",
      "padding-top": "1px",
    });
    const parent = computed(["@layer a{.p{--d:blue;--p:4px}}"], state({ classes: new Set(["p"]) }));
    expect(computed(css, state({ parent }))).toMatchObject({ "--d": "blue", color: "blue", "padding-top": "4px" });
    expect(computed(["@layer a{.x{--a:var(--b);--b:1px;margin:var(--a)}}"], state())["margin-top"]).toBe("1px");
  });

  it("unsets a declaration whose var() reads nothing once it has won, and inherits only color", () => {
    const css = ["@layer a{.x{color:red;padding:1px}}", "@layer b{.x{color:var(--c);padding:var(--p)}}"];
    expect(computed(css, state())).toEqual({});
    const parent = { color: "blue", "padding-top": "2px", "--q": "1px" };
    expect(computed(css, state({ parent }))).toEqual({ "--q": "1px", color: "blue" });
    // A custom property set empty is there, and empty, which is no value for padding.
    expect(computed(["@layer a{.x{padding:var(--p, 1px)}}"], state({ style: { "--p": "" } }))).toEqual({ "--p": "" });
    // In a cycle, neither custom property is there.
    expect(computed(["@layer a{.x{--a:var(--b);--b:var(--a);color:var(--a, red)}}"], state())).toEqual({
      color: "red",
    });
    // A custom property whose var() reads nothing has no value, rather than its parent's.
    expect(computed([".x{--g:var(--n);margin-top:var(--g, 1px)}"], state({ parent: { "--g": "7px" } }))).toEqual({
      "margin-top": "1px",
    });
  });

  it("makes every custom property in a cycle invalid, whatever fallback closed it, but not one an unused fallback names", () => {
    expect(computed([".x{--a:var(--a,red);color:var(--a,blue)}"], state())).toEqual({ color: "blue" });
    expect(computed([".x{--a:var(--b);--b:var(--a,1px);color:var(--b,blue)}"], state())).toEqual({ color: "blue" });
    expect(computed([".x{--a:var(--x,var(--a));margin-top:var(--a,7px)}"], state())).toEqual({ "margin-top": "7px" });
    expect(computed([".x{--b:1px;--a:var(--b,var(--a));margin-top:var(--a,7px)}"], state())).toEqual({
      "--a": "1px",
      "--b": "1px",
      "margin-top": "1px",
    });
  });

  it("ends a declaration at a semicolon outside strings and brackets, as in a style attribute", () => {
    expect(declarationsOf('background-image:url("data:a;b");content:"c;d";mask:url(e;f);;color: red ;x')).toEqual([
      ["background-image", 'url("data:a;b")'],
      ["content", '"c;d"'],
      ["mask", "url(e;f)"],
      ["color", "red"],
    ]);
  });

  it("reads var() only outside strings", () => {
    expect(computed(['.x{--l:"var(--missing)";content:var(--l);margin-top:1px}'], state())).toEqual({
      "--l": '"var(--missing)"',
      content: '"var(--missing)"',
      "margin-top": "1px",
    });
    expect(computed(['.x{content:"a" var(--l, "b var(c)")}'], state())).toEqual({ content: '"a" "b var(c)"' });
  });

  it("applies CSS-wide keywords to a custom property, which inherits and whose initial value is no value", () => {
    const read = (value: string, parent?: Record<string, string>, style?: Record<string, string>) =>
      computed([`.x{--r:${value};margin-top:var(--r, 9px)}`], state({ parent, style }));
    const parent = { "--r": "6px" };
    expect(read("initial", parent)).toEqual({ "margin-top": "9px" });
    for (const value of ["inherit", "unset", "revert", "revert-layer", " INHERIT ", "var(--x, inherit)"]) {
      expect(read(value, parent), value).toEqual({ "--r": "6px", "margin-top": "6px" });
      expect(read(value), value).toEqual({ "margin-top": "9px" });
    }
    // Set inline, a keyword is no different.
    expect(read("1px", parent, { "--r": "inherit" })).toEqual({ "--r": "6px", "margin-top": "6px" });
  });

  it("applies CSS-wide keywords to a property, inheriting only color unless told to", () => {
    const parent = { color: "red", "margin-top": "5px", "margin-left": "4px" };
    const read = (declarations: string) => computed([`.x{${declarations}}`], state({ parent }));
    expect(read("margin-top:inherit")).toEqual({ color: "red", "margin-top": "5px" });
    expect(read("margin:inherit")).toEqual({ color: "red", "margin-left": "4px", "margin-top": "5px" });
    expect(read("margin-top:var(--x, inherit)")).toEqual({ color: "red", "margin-top": "5px" });
    expect(read("color:initial;margin-top:unset")).toEqual({});
    for (const value of ["unset", "revert", "revert-layer", "inherit"]) {
      expect(read(`color:${value};margin-top:${value === "inherit" ? "0" : value}`), value).toEqual({
        color: "red",
        ...(value === "inherit" ? { "margin-top": "0" } : {}),
      });
    }
  });

  it("rolls revert-layer back to the layers below, and the style attribute's to every rule", () => {
    const css = ["@layer a,b;", "@layer a{.x{--q:4px;margin-top:3px;color:red}}"];
    expect(computed([...css, "@layer b{.x{--q:revert-layer;margin-top:revert-layer}}"], state())).toEqual({
      "--q": "4px",
      color: "red",
      "margin-top": "3px",
    });
    expect(computed([...css, ".x{margin-top:var(--x, revert-layer)}"], state())).toMatchObject({ "margin-top": "3px" });
    const style = { "--q": "revert-layer", "margin-top": "revert-layer", color: "revert-layer" };
    expect(computed([...css, ".x{color:blue}"], state({ style }))).toEqual({
      "--q": "4px",
      color: "blue",
      "margin-top": "3px",
    });
    // With nothing below, it reverts, and nothing is below the lowest layer's.
    expect(computed(["@layer a{.x{margin-top:revert-layer;--q:revert-layer}}"], state())).toEqual({});
  });

  it("reads media types, `not` and `only`, and refuses queries it cannot read", () => {
    const css = ["@layer a{@media not print{.x{color:red}}@media only print and (min-width: 1px){.x{color:blue}}}"];
    expect(computed(css, state())).toEqual({ color: "red" });
    expect(computed(css, state({ media: new Set(["print"]) }))).toEqual({ color: "blue" });
    expect(() => computed(["@media (hover) or (pointer){.x{color:red}}"], state())).toThrow(/unsupported media query/);
    expect(() => computed(["@media not (hover){.x{color:red}}"], state())).toThrow(/unsupported media query/);
  });

  it("maps logical longhands onto physical ones", () => {
    expect(computed(["@layer a{.x{padding-inline-start:1px;padding-left:2px}}"], state())).toEqual({
      "padding-left": "2px",
    });
  });
});

describe("the spec", () => {
  const hovered = state({ pseudo: new Set(["hover"]) });

  it("merges `&:hover` and `:hover` as one key, the later input replacing the whole key", () => {
    expect(expected([{ ":hover": { color: "red", margin: 1 } }, { "&:hover": { color: "blue" } }], hovered)).toEqual({
      color: "blue",
    });
    expect(expected([{ "@media (min-width: 40rem)": { "&:hover": { color: "red" } } }], hovered)).toEqual({
      color: "red",
    });
  });

  it("applies only strings and numbers, and lets any other value unset a key", () => {
    expect(
      expected(
        [
          { color: "red", margin: 1 },
          { color: false, margin: true },
        ],
        state(),
      ),
    ).toEqual({});
  });

  it("refuses conditions and properties outside its vocabulary, whose order it cannot state", () => {
    expect(() => expected([{ ".dark &": { color: "red" } }], state())).toThrow(/outside the oracle's vocabulary/);
    expect(() => expected([{ display: "flex" }], state())).toThrow(/outside the oracle's vocabulary/);
  });
});

describe("nishiki against the page's own layers", () => {
  const [className, rules] = resolve([{ color: "red", ":hover": { padding: 1 } }]);
  const [plain, hover] = rules.map(([, text]) => text);
  const reset = "@layer reset{.x{color:blue;padding:2px}}";
  const at = state({ classes: new Set([...className.split(" "), "x"]), pseudo: new Set(["hover"]) });
  const nishiki = {
    color: "red",
    "padding-bottom": "1px",
    "padding-left": "1px",
    "padding-right": "1px",
    "padding-top": "1px",
  };
  const theirs = {
    color: "blue",
    "padding-bottom": "2px",
    "padding-left": "2px",
    "padding-right": "2px",
    "padding-top": "2px",
  };

  it("ranks every nishiki rule on one side of a layer declared between them", () => {
    expect(computed([plain!, reset, hover!], at)).toEqual(theirs);
    expect(computed([layerOrder(), reset, plain!, hover!], at)).toEqual(theirs);
  });

  it("follows the order the page declares for nishiki among its layers", () => {
    expect(computed(["@layer reset, nishiki;", layerOrder(), plain!, reset, hover!], at)).toEqual(nishiki);
    expect(computed(["@layer nishiki, reset;", layerOrder(), plain!, reset, hover!], at)).toEqual(theirs);
  });
});

// Every order the rules may reach the document in, with the runtime's statement first, computes what the spec says.
describe("nishiki against the spec", () => {
  const check = (inputs: StyleInput[], styles: Style[], rnd: () => number) => {
    const [className, rules] = resolve(inputs);
    const classes = new Set(className.split(" ").filter(Boolean));
    for (let sample = 0; sample < 6; sample++) {
      const order = shuffled(
        rnd,
        rules.map(([, text]) => text),
      );
      const at = randomState(rnd, classes);
      const actual = computed([layerOrder(), ...order], at);
      const want = expected(styles, at);
      if (JSON.stringify(actual) !== JSON.stringify(want)) {
        return {
          styles,
          state: { ...at, classes: [...at.classes], pseudo: [...(at.pseudo ?? [])] },
          order,
          actual,
          want,
        };
      }
    }
    return null;
  };

  it("for random compositions in any rule order, as style objects", () => {
    const rnd = random(0xc0ffee);
    for (let index = 0; index < CASES; index++) {
      const compound = randomCompound(rnd);
      const styles = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => randomStyle(rnd, compound));
      expect(check(styles, styles, rnd), `case ${index}`).toBeNull();
    }
  });

  it("for random compositions in any rule order, compiled as the build plugin compiles them", () => {
    const rnd = random(0xbada55);
    for (let index = 0; index < CASES; index++) {
      const compound = randomCompound(rnd);
      const styles = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => randomStyle(rnd, compound));
      const inputs = styles.map((style) =>
        compiled(Object.entries(style).flatMap(([key, value]) => compileEntry(key, value))),
      );
      expect(check(inputs, styles, rnd), `case ${index}`).toBeNull();
    }
  });

  it("decides between overlapping breakpoints by width, whichever rule lands later", () => {
    const styles = [{ "@media (min-width: 64rem)": { padding: 16 } }, { "@media (min-width: 40rem)": { padding: 8 } }];
    const [className, rules] = resolve(styles);
    const at = state({ classes: new Set(className.split(" ")), width: 1100 });
    for (const order of [rules, [...rules].reverse()]) {
      expect(computed([layerOrder(), ...order.map(([, text]) => text)], at)["padding-top"]).toBe("16px");
    }
    expect(expected(styles, at)["padding-top"]).toBe("16px");
  });
});
