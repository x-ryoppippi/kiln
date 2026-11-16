import { hash, l, m, resolveNestedSelector, splitSelectorList, trimWhitespace, u } from "./utils.ts";

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
  return splitSelectorList(selector)
    .map((part) =>
      part.includes("&")
        ? part.replaceAll("&", "." + className)
        : "." + className + (part.startsWith(":") ? part : " " + part),
    )
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
  rules: Map<string, Rule>,
): void {
  if (value === null || value === undefined || value === false) return;

  if (typeof value === "object") {
    const nested = value as Record<string, unknown>;
    const atRule = trimWhitespace(prop);
    if (atRule.startsWith("@")) {
      atRules.push(atRule);
      for (const key in nested) {
        collect(key, nested[key], selector, atRules, depth + 1, rules);
      }
      atRules.pop();
    } else {
      const nestedSelector = resolveNestedSelector(prop, selector);
      for (const key in nested) {
        collect(key, nested[key], nestedSelector, atRules, depth + 1, rules);
      }
    }
    return;
  }

  if (typeof value !== "string" && typeof value !== "number") return;

  const layer = layerOf(prop, depth);
  const condition = formatSelector("&", selector) + "|" + atRules.join("|");
  const className = "k" + hash(prop + ":" + value + "|" + condition + "|" + layer);
  let text = formatSelector(className, selector) + "{" + formatDeclaration(prop, value) + "}";
  for (let index = atRules.length - 1; index >= 0; index--) {
    text = atRules[index] + "{" + text + "}";
  }
  text = "@layer " + layer + "{" + text + "}";

  // Two declarations of one property under the same condition would tie in the cascade, leaving the winner to
  // whichever rule the document happens to hold later; only the one written last applies.
  const slot = layer + "|" + condition + "|" + prop;
  rules.delete(slot);
  rules.set(slot, [className, text]);
}

// Only the leading `&` before a pseudo-class or pseudo-element is dropped: `& span` must stay apart from `span`,
// which as a key with a string value is a property (`& mask` vs `mask`).
function mergeKey(selector: string): string {
  return selector[0] === "&" && selector[1] === ":" && !selector.includes("&", 1) ? selector.slice(1) : selector;
}

function selectorsOf(key: string): string[] {
  if (!/[ \t\n\r\f,&]/.test(key)) return [key];
  const trimmed = trimWhitespace(key);
  if (trimmed.startsWith("@")) return [trimmed];
  return splitSelectorList(key);
}

/**
 * The merge keys a top-level style key stands for: one per selector of a selector list, trimmed, with `&:hover`
 * written as `:hover`, so keys that select the same elements merge as one. At-rules keep their lists, which form a
 * single condition.
 */
export function entryKeys(key: string): string[] {
  return selectorsOf(key).map(mergeKey);
}

/** Compile the value of one top-level style key into one entry per merge key. */
export function compileEntry(key: string, value: unknown): Entry[] {
  // Each selector compiles as written: a nested `&` stands for the whole parent, so `&:hover` and `:hover` differ
  // once something nested refers to `&`, although they merge as one key.
  return selectorsOf(key).map((selector): Entry => {
    const rules = new Map<string, Rule>();
    collect(selector, value, "", [], 0, rules);
    const list = [...rules.values()];
    return [mergeKey(selector), list.map(([className]) => className).join(" "), list];
  });
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;

  const rulesOf = (key: string, value: unknown) =>
    compileEntry(key, value).flatMap(([, , rules]) => rules.map(([, text]) => text));

  describe("compileEntry", () => {
    it("compiles a declaration into an atomic rule in the longhand layer", () => {
      const [key, className, rules] = compileEntry("color", "red")[0]!;
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
      const [, className, rules] = compileEntry(":hover", { color: "blue" })[0]!;
      expect(rules[0]![1]).toBe(`@layer k5{.${className}:hover{color:blue}}`);

      const [, mediaClass, mediaRules] = compileEntry("@media (min-width: 600px)", { "&:focus": { margin: 0 } })[0]!;
      expect(mediaRules[0]![1]).toBe(`@layer k6{@media (min-width: 600px){.${mediaClass}:focus{margin:0px}}}`);
    });

    it("skips nullish values", () => {
      expect(compileEntry("color", null)).toEqual([["color", "", []]]);
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
    compileEntry(key, value).flatMap(([, , rules]) =>
      rules.map(([className, text]) => text.replaceAll(className, "x")),
    );

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
      expect(compileEntry("color", false)).toEqual([["color", "", []]]);
      expect(compileEntry("color", undefined)).toEqual([["color", "", []]]);
      expect(compileEntry("color", true)).toEqual([["color", "", []]]);
      expect(compileEntry(":hover", {})).toEqual([[":hover", "", []]]);
      expect(shapesOf(":hover", { color: null, background: false, margin: 0 })).toEqual([
        "@layer k3{.x:hover{margin:0px}}",
      ]);
    });

    it("gives the same declaration different classes under different conditions", () => {
      const plain = compileEntry("color", "red")[0]![1];
      const hovered = compileEntry(":hover", { color: "red" })[0]![1];
      const media = compileEntry("@media print", { color: "red" })[0]![1];
      expect(new Set([plain, hovered, media]).size).toBe(3);
      expect(compileEntry("&:hover", { color: "red" })[0]![1]).toBe(hovered);
    });

    it("gives the same declaration different classes at different nesting depths", () => {
      // `&` selects what the top level does, but its rules sit one layer deeper; sharing a class would let a merge
      // that keeps one rule per class drop the deeper one.
      expect(compileEntry("&", { color: "red" })[0]![1]).not.toBe(compileEntry("color", "red")[0]![1]);
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
      expect(shapesOf(":hover, :focus", { color: "red" })).toEqual([
        "@layer k5{.x:hover{color:red}}",
        "@layer k5{.x:focus{color:red}}",
      ]);
      expect(shapesOf(".parent &", { color: "red" })).toEqual(["@layer k5{.parent .x{color:red}}"]);
      expect(shapesOf("& + &", { margin: 0 })).toEqual(["@layer k3{.x + .x{margin:0px}}"]);
      expect(shapesOf("span", { color: "red" })).toEqual(["@layer k5{.x span{color:red}}"]);
      expect(shapesOf('&[data-state="open"]', { color: "red" })).toEqual([
        '@layer k5{.x[data-state="open"]{color:red}}',
      ]);
      expect(shapesOf(":is(a, b)", { color: "red" })).toEqual(["@layer k5{.x:is(a, b){color:red}}"]);
    });

    it("multiplies nested selector lists", () => {
      expect(shapesOf(":hover", { "& span, & em": { color: "red" } })).toEqual([
        "@layer k8{.x:hover span,.x:hover em{color:red}}",
      ]);
      expect(shapesOf(":hover, :focus", { "& span, & em": { color: "red" } })).toEqual([
        "@layer k8{.x:hover span,.x:hover em{color:red}}",
        "@layer k8{.x:focus span,.x:focus em{color:red}}",
      ]);
    });

    it("scopes every part of a list that mixes ampersands with plain parts", () => {
      expect(shapesOf("&:hover, span", { color: "red" })).toEqual([
        "@layer k5{.x:hover{color:red}}",
        "@layer k5{.x span{color:red}}",
      ]);
      expect(shapesOf(".dark &, :focus", { color: "red" })).toEqual([
        "@layer k5{.dark .x{color:red}}",
        "@layer k5{.x:focus{color:red}}",
      ]);
      expect(shapesOf("&:hover, span", { ":focus": { color: "red" } })).toEqual([
        "@layer k8{.x:hover:focus{color:red}}",
        "@layer k8{.x span:focus{color:red}}",
      ]);
    });
  });

  describe("merge keys", () => {
    it("writes keys that select the same elements the same way", () => {
      expect(entryKeys(":hover")).toEqual([":hover"]);
      expect(entryKeys("&:hover")).toEqual([":hover"]);
      expect(entryKeys("  &:hover ")).toEqual([":hover"]);
      expect(entryKeys("&::before")).toEqual(["::before"]);
      expect(entryKeys(" @media print ")).toEqual(["@media print"]);
    });

    it("keeps keys apart that select different elements", () => {
      expect(entryKeys("& :hover")).toEqual(["& :hover"]);
      expect(entryKeys("&.active")).toEqual(["&.active"]);
      expect(entryKeys("& + &")).toEqual(["& + &"]);
      expect(entryKeys(".dark &")).toEqual([".dark &"]);
      expect(entryKeys('[title="a  b"] &')).toEqual(['[title="a  b"] &']);
      expect(entryKeys(".\\31  span")).toEqual([".\\31  span"]);
    });

    it("keeps a descendant selector apart from a property of the same name", () => {
      expect(entryKeys("& mask")).toEqual(["& mask"]);
      expect(entryKeys("& span")).toEqual(["& span"]);
    });

    it("splits a selector list into one key per selector, but not a list of media queries", () => {
      expect(entryKeys(":hover, &:focus")).toEqual([":hover", ":focus"]);
      expect(entryKeys(":is(a, b), span")).toEqual([":is(a, b)", "span"]);
      expect(entryKeys("@media print, (max-width: 600px)")).toEqual(["@media print, (max-width: 600px)"]);
      expect(entryKeys(" @media print, screen ")).toEqual(["@media print, screen"]);
      expect(shapesOf("\n@media print, screen", { color: "red" })).toEqual([
        "@layer k5{@media print, screen{.x{color:red}}}",
      ]);
    });

    it("trims only CSS whitespace, since a no-break space is part of a name", () => {
      expect(entryKeys("--theme\u00a0")).toEqual(["--theme\u00a0"]);
      expect(declarationOf("--theme\u00a0", "red")).toBe("--theme\u00a0:red");
      expect(entryKeys("\u00a0span, em")).toEqual(["\u00a0span", "em"]);
    });

    it("recognises a nested at-rule written with surrounding whitespace", () => {
      expect(shapesOf(":hover", { " @media print, screen": { color: "red" } })).toEqual([
        "@layer k8{@media print, screen{.x:hover{color:red}}}",
      ]);
    });

    it("compiles each selector of a list as its own key would", () => {
      const value = { color: "red", margin: 0 };
      expect(compileEntry(":hover, &:focus", value)).toEqual([
        ...compileEntry(":hover", value),
        ...compileEntry(":focus", value),
      ]);
      expect(compileEntry(":hover, :focus", null)).toEqual([
        [":hover", "", []],
        [":focus", "", []],
      ]);
    });

    it("compiles each selector as written, so a nested `&` still stands for the whole parent", () => {
      expect(shapesOf("&:hover", { ".dark &": { color: "red" }, "& + &": { margin: 0 } })).toEqual([
        "@layer k8{.dark .x:hover{color:red}}",
        "@layer k6{.x:hover + .x:hover{margin:0px}}",
      ]);
      expect(shapesOf("&:hover, & span", { ".dark &": { color: "red" } })).toEqual([
        "@layer k8{.dark .x:hover{color:red}}",
        "@layer k8{.dark .x span{color:red}}",
      ]);
      expect(compileEntry("&:hover", { ".dark &": { color: "red" } })[0]![0]).toBe(":hover");
    });

    it("compiles keys that only read differently to the same entry", () => {
      const value = { color: "red", ":focus": { margin: 0 } };
      for (const key of ["&:hover", " :hover", "&:hover "]) {
        expect(compileEntry(key, value)).toEqual(compileEntry(":hover", value));
      }
    });
  });

  describe("declarations under one condition", () => {
    it("keeps only the one written last, where it was written", () => {
      expect(
        shapesOf("@media print", { ":hover": { color: "red" }, padding: 1, "&:hover": { color: "blue" } }),
      ).toEqual(["@layer k3{@media print{.x{padding:1px}}}", "@layer k8{@media print{.x:hover{color:blue}}}"]);
      const [, className, rules] = compileEntry(":hover", { "& span": { color: "red" }, span: { color: "blue" } })[0]!;
      expect(className.split(" ")).toEqual(rules.map(([ruleClass]) => ruleClass));
      expect(rules).toHaveLength(1);
    });

    it("keeps declarations of one property under different conditions", () => {
      expect(
        shapesOf(":hover", { color: "red", ":focus": { color: "blue" }, "@media print": { color: "green" } }),
      ).toEqual([
        "@layer k5{.x:hover{color:red}}",
        "@layer k8{.x:hover:focus{color:blue}}",
        "@layer k8{@media print{.x:hover{color:green}}}",
      ]);
    });
  });
}
