import { hash, l, m, resolveNestedSelector, splitSelectorList, u } from "./utils.ts";

/** A single atomic rule: the class name it is keyed by and its full CSS text. */
export type Rule = readonly [className: string, text: string];

/**
 * Compiled styles for one top-level key of a style object.
 * Merging works on whole entries, so a later entry for the same key replaces an earlier one.
 */
export type Entry = readonly [key: string, className: string, rules: readonly Rule[]];

const MAX_DEPTH = 3;
const LEVELS = 3;

/**
 * Atomic rules are ordered by cascade layer rather than insertion order:
 * shorthands < mid-level shorthands < longhands, and every nesting level above the previous one.
 * This makes runtime-injected and build-time-extracted CSS order-independent.
 */
export const LAYER_ORDER: string =
  "@layer " + Array.from({ length: (MAX_DEPTH + 1) * LEVELS }, (_, index) => "k" + index).join(",") + ";";

function layerOf(key: string, depth: number): string {
  const level = l.has(key) ? 0 : m.has(key) ? 1 : 2;
  return "k" + (Math.min(depth, MAX_DEPTH) * LEVELS + level);
}

function formatSelector(className: string, selector: string): string {
  if (selector === "") return "." + className;
  if (selector.includes("&")) return selector.replaceAll("&", "." + className);
  return splitSelectorList(selector)
    .map((part) => "." + className + (part.startsWith(":") ? part : " " + part))
    .join(",");
}

function formatDeclaration(prop: string, value: string | number): string {
  const property = prop.startsWith("--") ? prop : prop.replace(/[A-Z]|^ms/g, "-$&").toLowerCase();
  const parsed = typeof value === "number" && !prop.startsWith("--") && !u.test(prop) ? value + "px" : value;
  return property + ":" + parsed;
}

function collect(
  prop: string,
  value: unknown,
  selector: string,
  atRules: string[],
  depth: number,
  classNames: string[],
  rules: Rule[],
): void {
  if (value === null || value === undefined || value === false) return;

  if (typeof value === "object") {
    const nested = value as Record<string, unknown>;
    if (prop.startsWith("@")) {
      atRules.push(prop);
      for (const key in nested) {
        collect(key, nested[key], selector, atRules, depth + 1, classNames, rules);
      }
      atRules.pop();
    } else {
      const nestedSelector = resolveNestedSelector(prop, selector);
      for (const key in nested) {
        collect(key, nested[key], nestedSelector, atRules, depth + 1, classNames, rules);
      }
    }
    return;
  }

  if (typeof value !== "string" && typeof value !== "number") return;

  const className = "k" + hash(prop + ":" + value + "|" + formatSelector("&", selector) + "|" + atRules.join("|"));
  let text = formatSelector(className, selector) + "{" + formatDeclaration(prop, value) + "}";
  for (let index = atRules.length - 1; index >= 0; index--) {
    text = atRules[index] + "{" + text + "}";
  }
  text = "@layer " + layerOf(prop, depth) + "{" + text + "}";

  classNames.push(className);
  rules.push([className, text]);
}

/** Compile the value of one top-level style key into an entry. */
export function compileEntry(key: string, value: unknown): Entry {
  const classNames: string[] = [];
  const rules: Rule[] = [];
  collect(key, value, "", [], 0, classNames, rules);
  return [key, classNames.join(" "), rules];
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;

  const rulesOf = (key: string, value: unknown) => compileEntry(key, value)[2].map(([, text]) => text);

  describe("compileEntry", () => {
    it("compiles a declaration into an atomic rule in the longhand layer", () => {
      const [key, className, rules] = compileEntry("color", "red");
      expect(key).toBe("color");
      expect(className).toMatch(/^k[0-9a-z]+$/);
      expect(rules).toEqual([[className, `@layer k2{.${className}{color:red}}`]]);
    });

    it("layers shorthands below mid-level shorthands below longhands", () => {
      expect(rulesOf("margin", 0)[0]).toMatch(/^@layer k0\{/);
      expect(rulesOf("borderTop", "1px solid")[0]).toMatch(/^@layer k1\{/);
      expect(rulesOf("marginTop", 0)[0]).toMatch(/^@layer k2\{/);
    });

    it("adds px only where the property takes a length", () => {
      expect(rulesOf("padding", 8)[0]).toContain("{padding:8px}");
      expect(rulesOf("lineHeight", 1.5)[0]).toContain("{line-height:1.5}");
      expect(rulesOf("--gap", 4)[0]).toContain("{--gap:4}");
    });

    it("places nested selectors and at-rules in deeper layers", () => {
      const [, className, rules] = compileEntry(":hover", { color: "blue" });
      expect(rules[0]![1]).toBe(`@layer k5{.${className}:hover{color:blue}}`);

      const [, mediaClass, mediaRules] = compileEntry("@media (min-width: 600px)", { "&:focus": { margin: 0 } });
      expect(mediaRules[0]![1]).toBe(`@layer k6{@media (min-width: 600px){.${mediaClass}:focus{margin:0px}}}`);
    });

    it("skips nullish values", () => {
      expect(compileEntry("color", null)).toEqual(["color", "", []]);
    });

    it("declares every layer it can emit", () => {
      expect(LAYER_ORDER).toBe("@layer k0,k1,k2,k3,k4,k5,k6,k7,k8,k9,k10,k11;");
    });
  });

  const declarationOf = (key: string, value: unknown) => /\{([^{}]*)\}+$/.exec(rulesOf(key, value)[0]!)![1];

  describe("unitless numbers", () => {
    // Ported from facebook/stylex packages/@stylexjs/babel-plugin/src/shared/utils/transform-value.js
    // (`unitlessNumberProperties`). StyleX also lists `rotate`, which takes an angle and is invalid both
    // with and without px, and `strokeWidth`, `strokeDasharray` and `strokeDashoffset`, which take
    // lengths, so kiln keeps px for those.
    const unitless = [
      "WebkitLineClamp",
      "animationIterationCount",
      "aspectRatio",
      "borderImageOutset",
      "borderImageSlice",
      "borderImageWidth",
      "counterSet",
      "counterReset",
      "columnCount",
      "flex",
      "flexGrow",
      "flexShrink",
      "flexOrder",
      "gridRow",
      "gridRowStart",
      "gridRowEnd",
      "gridColumn",
      "gridColumnStart",
      "gridColumnEnd",
      "gridArea",
      "fontSizeAdjust",
      "fontWeight",
      "hyphenateLimitChars",
      "lineClamp",
      "lineHeight",
      "maskBorderOutset",
      "maskBorderSlice",
      "maskBorderWidth",
      "opacity",
      "order",
      "orphans",
      "tabSize",
      "widows",
      "zIndex",
      "fillOpacity",
      "floodOpacity",
      "scale",
      "shapeImageThreshold",
      "stopOpacity",
      "strokeMiterlimit",
      "strokeOpacity",
      "mathDepth",
      "zoom",
    ];

    it.each(unitless)("leaves %s unitless", (property) => {
      expect(declarationOf(property, 2)).toMatch(/:2$/);
    });

    it.each(["strokeWidth", "strokeDasharray", "strokeDashoffset", "containIntrinsicHeight"])(
      "adds px to %s",
      (property) => {
        expect(declarationOf(property, 2)).toMatch(/:2px$/);
      },
    );
  });

  // Each rule's own class name reads as `x`, so expectations show the CSS shape.
  const shapesOf = (key: string, value: unknown) =>
    compileEntry(key, value)[2].map(([className, text]) => text.replaceAll(className, "x"));

  describe("values", () => {
    // Ported from facebook/stylex packages/@stylexjs/babel-plugin/__tests__/transform-value-normalization-test.js
    it("adds px to numbers for properties that take lengths", () => {
      expect(shapesOf("height", 500)).toEqual(["@layer k2{.x{height:500px}}"]);
      expect(shapesOf("margin", 10)).toEqual(["@layer k0{.x{margin:10px}}"]);
      expect(shapesOf("width", 500)).toEqual(["@layer k2{.x{width:500px}}"]);
      // StyleX emits a bare `0`; kiln treats zero like any other number.
      expect(shapesOf("marginLeft", 0)).toEqual(["@layer k2{.x{margin-left:0px}}"]);
    });

    it("leaves numbers unitless for unitless properties", () => {
      // StyleX also strips leading zeros (`.545`); kiln prints numbers the way JavaScript does.
      expect(declarationOf("fontSizeAdjust", 0.545)).toBe("font-size-adjust:0.545");
      expect(declarationOf("fontWeight", 500)).toBe("font-weight:500");
      expect(declarationOf("lineHeight", 1.5)).toBe("line-height:1.5");
      expect(declarationOf("opacity", 0.5)).toBe("opacity:0.5");
      expect(declarationOf("zoom", 2)).toBe("zoom:2");
    });

    it("does not round numbers", () => {
      // StyleX rounds to four decimal places (`33.3333px`).
      expect(declarationOf("height", 100 / 3)).toBe("height:33.333333333333336px");
    });

    it("keeps the sign of negative numbers", () => {
      expect(declarationOf("marginTop", -10)).toBe("margin-top:-10px");
      expect(declarationOf("zIndex", -1)).toBe("z-index:-1");
      expect(declarationOf("letterSpacing", -0.5)).toBe("letter-spacing:-0.5px");
    });

    // StyleX minifies values: it collapses whitespace, turns `0px` into `0` and `500ms` into `.5s`,
    // and quotes `content`. kiln emits strings exactly as written, so the CSS is what the author typed.
    it.each([
      ["transform", "  rotate(10deg)  translate3d( 0 , 0 , 0 )  "],
      ["color", "rgba( 1, 222,  33 , 0.5)"],
      ["margin", "0px"],
      ["transitionDuration", "500ms"],
      ["transitionTimingFunction", "cubic-bezier(.08,.52,.52,1)"],
      ["width", "calc((100% + 3% -   100px) / 7)"],
      ["width", "max(1px, 2px) calc(0px + 1%)"],
      ["backgroundImage", "url(0.5x.png)"],
      ["backgroundImage", "URL(/img/logo.png)"],
      ["backgroundImage", "image-set(url(0.5x.png) 1x, url(1x.png) 2x)"],
      ["cursor", "URL(/cursors/grab.cur), pointer"],
      ["content", '"prev"'],
      ["content", 'open-quote "hello" close-quote'],
      ["content", "'\\2014'"],
      ["quotes", "''"],
      ["color", "red !important"],
    ])("keeps %s: %j as written", (property, value) => {
      expect(declarationOf(property, value)).toMatch(new RegExp(":" + RegExp.escape(value) + "$"));
    });

    // Ported from facebook/stylex packages/@stylexjs/babel-plugin/__tests__/transform-stylex-create-test.js
    it("keeps custom property names and values as written", () => {
      expect(declarationOf("--background-color", "red")).toBe("--background-color:red");
      expect(declarationOf("--otherColor", "green")).toBe("--otherColor:green");
      expect(declarationOf("--foo", 10)).toBe("--foo:10");
      expect(shapesOf("--foo", 10)[0]).toMatch(/^@layer k2\{/);
    });

    // Ported from facebook/stylex packages/@stylexjs/stylex/__tests__/stylex-test.js
    it("hyphenates vendor-prefixed properties", () => {
      expect(declarationOf("MsTransition", "none")).toBe("-ms-transition:none");
      expect(declarationOf("msTransition", "none")).toBe("-ms-transition:none");
      expect(declarationOf("WebkitTapHighlightColor", "transparent")).toBe("-webkit-tap-highlight-color:transparent");
    });

    it("skips nullish, false and non-CSS values, also when nested", () => {
      expect(compileEntry("color", false)).toEqual(["color", "", []]);
      expect(compileEntry("color", undefined)).toEqual(["color", "", []]);
      expect(compileEntry("color", true)).toEqual(["color", "", []]);
      expect(compileEntry(":hover", {})).toEqual([":hover", "", []]);
      expect(shapesOf(":hover", { color: null, background: false, margin: 0 })).toEqual([
        "@layer k3{.x:hover{margin:0px}}",
      ]);
    });

    it("gives the same declaration different classes under different conditions", () => {
      const plain = compileEntry("color", "red")[1];
      const hovered = compileEntry(":hover", { color: "red" })[1];
      const media = compileEntry("@media print", { color: "red" })[1];
      expect(new Set([plain, hovered, media]).size).toBe(3);
      expect(compileEntry("&:hover", { color: "red" })[1]).toBe(hovered);
    });
  });

  describe("selectors", () => {
    // Ported from facebook/stylex packages/@stylexjs/babel-plugin/__tests__/transform-stylex-create-test.js
    it("compiles pseudo-classes one level deeper", () => {
      expect(shapesOf(":hover", { backgroundColor: "red", color: "blue" })).toEqual([
        "@layer k5{.x:hover{background-color:red}}",
        "@layer k5{.x:hover{color:blue}}",
      ]);
      expect(shapesOf(":focus-visible", { outline: "2px solid" })).toEqual([
        "@layer k3{.x:focus-visible{outline:2px solid}}",
      ]);
    });

    it("compiles pseudo-elements", () => {
      expect(shapesOf("::before", { color: "red" })).toEqual(["@layer k5{.x::before{color:red}}"]);
      expect(shapesOf("::after", { color: "blue" })).toEqual(["@layer k5{.x::after{color:blue}}"]);
      expect(shapesOf("::placeholder", { color: "gray" })).toEqual(["@layer k5{.x::placeholder{color:gray}}"]);
    });

    it("compiles compound pseudo selectors given as one key", () => {
      expect(shapesOf(":hover::after", { color: "red" })).toEqual(["@layer k5{.x:hover::after{color:red}}"]);
      expect(shapesOf("&:hover::before", { color: "blue" })).toEqual(["@layer k5{.x:hover::before{color:blue}}"]);
    });

    it("appends nested pseudo selectors in nesting order", () => {
      // StyleX hoists pseudo-classes nested in `::before` in front of it (`:hover::before`).
      // kiln nests selectors literally, so a pseudo-class on the element is written as `:hover::before`.
      expect(shapesOf("::before", { ":hover": { color: "blue" } })).toEqual([
        "@layer k8{.x::before:hover{color:blue}}",
      ]);
      expect(shapesOf(":hover", { ":focus": { color: "red" } })).toEqual(["@layer k8{.x:hover:focus{color:red}}"]);
    });

    it("wraps declarations in media, supports and container queries", () => {
      // StyleX repeats the class (`.x.x`) to raise specificity inside at-rules; kiln uses a deeper layer.
      expect(shapesOf("@media (min-width: 1000px)", { backgroundColor: "blue" })).toEqual([
        "@layer k5{@media (min-width: 1000px){.x{background-color:blue}}}",
      ]);
      expect(shapesOf("@supports not (hover: hover)", { backgroundColor: "purple" })).toEqual([
        "@layer k5{@supports not (hover: hover){.x{background-color:purple}}}",
      ]);
      expect(shapesOf("@container sidebar (min-width: 400px)", { padding: 8 })).toEqual([
        "@layer k3{@container sidebar (min-width: 400px){.x{padding:8px}}}",
      ]);
    });

    it("combines media queries with pseudo-classes", () => {
      expect(shapesOf("@media (min-width: 800px)", { fontSize: "2rem", ":hover": { fontSize: "2.2rem" } })).toEqual([
        "@layer k5{@media (min-width: 800px){.x{font-size:2rem}}}",
        "@layer k8{@media (min-width: 800px){.x:hover{font-size:2.2rem}}}",
      ]);
    });

    it("nests at-rules outermost first", () => {
      expect(shapesOf("@supports (display: grid)", { "@media (min-width: 600px)": { display: "grid" } })).toEqual([
        "@layer k8{@supports (display: grid){@media (min-width: 600px){.x{display:grid}}}}",
      ]);
      expect(shapesOf(":hover", { "@media (hover: hover)": { color: "red" } })).toEqual([
        "@layer k8{@media (hover: hover){.x:hover{color:red}}}",
      ]);
    });

    it("stops raising the layer below the deepest nesting level", () => {
      const deep = { ":a": { ":b": { ":c": { ":d": { color: "red", margin: 0 } } } } };
      expect(shapesOf(":root", deep)).toEqual([
        "@layer k11{.x:root:a:b:c:d{color:red}}",
        "@layer k9{.x:root:a:b:c:d{margin:0px}}",
      ]);
    });

    it("resolves selector lists, ampersands and descendants", () => {
      expect(shapesOf(":hover, :focus", { color: "red" })).toEqual(["@layer k5{.x:hover,.x:focus{color:red}}"]);
      expect(shapesOf(".parent &", { color: "red" })).toEqual(["@layer k5{.parent .x{color:red}}"]);
      expect(shapesOf("& + &", { margin: 0 })).toEqual(["@layer k3{.x + .x{margin:0px}}"]);
      expect(shapesOf("span", { color: "red" })).toEqual(["@layer k5{.x span{color:red}}"]);
      expect(shapesOf('&[data-state="open"]', { color: "red" })).toEqual([
        '@layer k5{.x[data-state="open"]{color:red}}',
      ]);
      expect(shapesOf(":is(a, b)", { color: "red" })).toEqual(["@layer k5{.x:is(a, b){color:red}}"]);
    });

    it("multiplies nested selector lists", () => {
      expect(shapesOf(":hover, :focus", { "& span, & em": { color: "red" } })).toEqual([
        "@layer k8{.x:hover span,.x:hover em,.x:focus span,.x:focus em{color:red}}",
      ]);
    });
  });
}
