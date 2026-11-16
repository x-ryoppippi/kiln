import { describe, expect, it } from "vite-plus/test";

import { compiled, compileEntry, layerOrder, resolve, type StyleInput } from "../../src/core/index.ts";
import { computed, type ElementState } from "./cascade.ts";
import { expected, type Style } from "./spec.ts";
import { random, randomCompound, randomState, randomStyle, shuffled } from "./vocabulary.ts";

const CASES = Number(process.env.KILN_ORACLE_CASES ?? 400);

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

  it("maps logical longhands onto physical ones", () => {
    expect(computed(["@layer a{.x{padding-inline-start:1px;padding-left:2px}}"], state())).toEqual({
      "padding-left": "2px",
    });
  });
});

// Every order the rules may reach the document in, with the runtime's statement first, computes what the spec says.
describe("kiln against the spec", () => {
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
