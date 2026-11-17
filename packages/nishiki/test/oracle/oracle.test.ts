import { describe, expect, it } from "vite-plus/test";

import { compiled, compileEntry, layerOrder, resolve, type StyleInput } from "../../src/core/index.ts";
import { computed, type ElementState } from "./cascade.ts";
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
      color: 'var(--a, ";}")',
      "padding-left": "1px",
    });
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
