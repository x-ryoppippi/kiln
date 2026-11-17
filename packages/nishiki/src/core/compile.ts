import { conditionsOf, createTable, rankOf, type Condition, type ConditionOptions, type Table } from "./conditions.ts";
import { conditionOptions, layerName, setConditions } from "./config.ts";
import { depthOf } from "./properties.ts";
import { useCompiler } from "./resolve.ts";
import { formatSelector, ruleOf, type Entry, type Rule } from "./rule.ts";

export type { Entry, Rule };
import { resolveNestedSelector, splitSelectorList, trimWhitespace } from "./utils.ts";

/**
 * What compiling a style can tell about it: a condition no rank is configured for, an `!important` value, or an
 * at-rule key that cannot hold styles, which is an error.
 */
export type Notice = { unranked: Condition } | { important: string } | { atRule: string };

/** The ranks and the listener a compile uses. */
export interface CompileContext {
  table: Table;
  notify?: (notice: Notice) => void;
}

let active: [ConditionOptions, Table] | undefined;
let compiledWith: ConditionOptions | undefined;
const told = new Set<string>();

/** What a notice means for the cascade. */
export const noticeMessage = (notice: Notice): string =>
  "unranked" in notice
    ? `${JSON.stringify(notice.unranked[1])} is not in conditions.order, so it ties with the other conditions of its ` +
      `category missing from it, and the document order of their rules decides between them`
    : "important" in notice
      ? `${JSON.stringify(notice.important)} is !important, which nishiki's layers do not order`
      : `${JSON.stringify(notice.atRule)} cannot hold styles: only @media, @supports, @container, @scope, ` +
        `@starting-style and @layer can, so write ${/^@[\w-]*/.exec(notice.atRule)![0]} in a plain stylesheet`;

// A browser has no `process` unless the bundler defines `process.env.NODE_ENV`, which then drops the warnings.
const warn: ((notice: Notice) => void) | null =
  typeof process !== "undefined" && process.env.NODE_ENV !== "production"
    ? (notice) => {
        const text = noticeMessage(notice) + ".";
        if (!told.has(text)) {
          told.add(text);
          console.warn("[nishiki] " + text);
        }
      }
    : null;

const tell = (notice: Notice): void => {
  if ("atRule" in notice) throw new Error("[nishiki] " + noticeMessage(notice) + ".");
  warn?.(notice);
};

// At-rules whose block holds style rules. Any other, such as @keyframes or @font-face, holds keyframes, descriptors or
// nothing, so wrapping the element's rule in it is not CSS.
const GROUPING = /^@(?:media|supports|container|scope|starting-style|layer)(?![\w-])/i;

/** The ranks the runtime compiles with. */
export function activeTable(): Table {
  const options = conditionOptions();
  if (active?.[0] !== options) active = [options, createTable(options)];
  return active[1];
}

/**
 * Set how the runtime ranks conditions. Call it before any style is compiled, and only without the build plugin, which
 * configures the runtime with its own `conditions` option.
 */
export function configure(options: ConditionOptions): void {
  const table = createTable(options);
  if (
    typeof process !== "undefined" &&
    process.env.NODE_ENV !== "production" &&
    compiledWith &&
    JSON.stringify(compiledWith) !== JSON.stringify(options)
  ) {
    console.error("[nishiki] configure() was called after styles were compiled with other conditions.");
  }
  setConditions(options, table.size);
  active = [options, table];
}

/** Let `resolve` compile style objects at runtime. */
export const register = (): void => useCompiler((key, value) => compileEntry(key, value));

function collect(
  prop: string,
  value: unknown,
  selector: string,
  atRules: string[],
  rules: Map<string, Rule>,
  context: CompileContext,
): void {
  if (value === null || value === undefined || value === false) return;
  const notify = context.notify ?? tell;

  const atRule = prop.includes("@") ? trimWhitespace(prop) : "";
  if (atRule.startsWith("@") && !GROUPING.test(atRule)) {
    notify({ atRule });
    return;
  }

  if (typeof value === "object") {
    const nested = value as Record<string, unknown>;
    if (atRule.startsWith("@")) {
      atRules.push(atRule);
      for (const key in nested) collect(key, nested[key], selector, atRules, rules, context);
      atRules.pop();
    } else {
      const nestedSelector = resolveNestedSelector(prop, selector);
      for (const key in nested) collect(key, nested[key], nestedSelector, atRules, rules, context);
    }
    return;
  }

  if (typeof value !== "string" && typeof value !== "number") return;
  if (typeof value === "string" && /!\s*important\s*$/i.test(value)) notify({ important: prop + ": " + value });

  // Each selector of a list is a rule of its own, since its conditions decide its layer.
  for (const part of selector ? splitSelectorList(selector) : [""]) {
    const resolved = !part || part.includes("&") ? part || "&" : (part[0] === ":" ? "&" : "& ") + part;
    const rank = rankOf(context.table, conditionsOf(resolved, atRules), (unranked) => notify({ unranked }));
    const layer = layerName(rank, prop.startsWith("--") ? 0 : depthOf(prop));
    const condition = formatSelector("&", part) + "|" + atRules.join("|");

    // Two declarations of one property under the same condition would tie in the cascade, leaving the winner to
    // whichever rule the document happens to hold later; only the one written last applies.
    const slot = layer + "|" + condition + "|" + prop;
    rules.delete(slot);
    rules.set(slot, ruleOf(prop, value, part, atRules, layer));
  }
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
export function compileEntry(key: string, value: unknown, context?: CompileContext): Entry[] {
  if (!context) {
    context = { table: activeTable() };
    compiledWith = conditionOptions();
  }
  // Each selector compiles as written: a nested `&` stands for the whole parent, so `&:hover` and `:hover` differ
  // once something nested refers to `&`, although they merge as one key.
  return selectorsOf(key).map((selector): Entry => {
    const rules = new Map<string, Rule>();
    collect(selector, value, "", [], rules, context);
    const list = [...rules.values()];
    return [mergeKey(selector), list.map(([className]) => className).join(" "), list];
  });
}

if (import.meta.vitest) {
  const { afterEach, describe, expect, it, vi } = import.meta.vitest;
  const { rankOfLayer } = await import("./conditions.ts");
  const { layerOrder } = await import("./config.ts");

  const rulesOf = (key: string, value: unknown) =>
    compileEntry(key, value).flatMap(([, , rules]) => rules.map(([, text]) => text));

  describe("compileEntry", () => {
    it("compiles a declaration into an atomic rule in the longhand layer", () => {
      const [key, className, rules] = compileEntry("color", "red")[0]!;
      expect(key).toBe("color");
      expect(className).toMatch(/^n[0-9a-z]+$/);
      expect(rules).toEqual([[className, `@layer nishiki.n0{.${className}{color:red}}`]]);
    });

    it("nests broader shorthands and logical properties deeper inside their condition's layer", () => {
      const layer = (key: string, value: unknown) => /^@layer nishiki\.([^{]+)\{/.exec(rulesOf(key, value)[0]!)![1];
      expect(layer("all", "unset")).toBe("n0" + ".a".repeat(8));
      expect(layer("border", "none")).toBe("n0" + ".a".repeat(7));
      expect(layer("margin", 0)).toBe("n0.a.a.a");
      expect(layer("marginInline", 0)).toBe("n0.a.a");
      expect(layer("marginInlineStart", 0)).toBe("n0.a");
      expect(layer("marginLeft", 0)).toBe("n0");
      expect(layer("WebkitBorderRadius", 0)).toBe(layer("borderRadius", 0));
      expect(layer("--margin", 0)).toBe("n0");
    });

    it("adds px only where the property takes a length", () => {
      expect(rulesOf("padding", 8)[0]).toContain("{padding:8px}");
      expect(rulesOf("lineHeight", 1.5)[0]).toContain("{line-height:1.5}");
      expect(rulesOf("--gap", 4)[0]).toContain("{--gap:4}");
    });

    it("puts a rule in the layer of the rank of its conditions", () => {
      const table = activeTable();
      const rank = (selector: string, atRules: string[] = []) => rankOf(table, conditionsOf(selector, atRules));
      const [, className, rules] = compileEntry(":hover", { color: "blue" })[0]!;
      expect(rules[0]![1]).toBe(`@layer nishiki.${layerName(rank("&:hover"))}{.${className}:hover{color:blue}}`);

      const [, mediaClass, mediaRules] = compileEntry("@media (min-width: 40rem)", { "&:focus": { margin: 0 } })[0]!;
      const compound = layerName(rank("&:focus", ["@media (min-width: 40rem)"]), 3);
      expect(mediaRules[0]![1]).toBe(
        `@layer nishiki.${compound}{@media (min-width: 40rem){.${mediaClass}:focus{margin:0px}}}`,
      );
    });

    it("ranks pseudo-elements and descendants with the element they belong to", () => {
      for (const key of ["::before", "& span", "span", "& > li:first-child"]) {
        expect(rulesOf(key, { color: "red" })[0], key).toMatch(/^@layer nishiki\.n0\{/);
      }
      const layer = (key: string) => /^@layer nishiki\.([^{]+)\{/.exec(rulesOf(key, { color: "red" })[0]!)![1];
      expect(layer(":hover::after")).toBe(layer(":hover"));
      expect(layer(":hover span")).toBe(layer(":hover"));
    });

    it("splits a nested selector list into a rule per selector, each in its own layer", () => {
      const [entry] = compileEntry(":hover", { "&, &:focus": { color: "red" } });
      expect(entry![2]).toHaveLength(2);
      expect(entry![1].split(" ")).toHaveLength(2);
      expect(new Set(entry![2].map(([, text]) => text.slice(0, text.indexOf("{")))).size).toBe(2);
    });

    it("reports unranked conditions and !important values", () => {
      const notices: Notice[] = [];
      compileEntry(".dark &", { color: "red !important" }, { table: activeTable(), notify: (n) => notices.push(n) });
      expect(notices).toEqual([{ important: "color: red !important" }, { unranked: [3, ".dark &"] }]);
    });

    it("compiles a runtime value in the layer the build ranked its key into as it compiles the literal", async () => {
      const { compileValue } = await import("./rule.ts");
      const { compiled } = await import("./resolve.ts");
      for (const key of ["color", "margin", "marginInlineStart", "WebkitLineClamp", "--gap", "zIndex"]) {
        for (const value of ["red", 4, 0, null, undefined, false, true, "1px !important"]) {
          const layer = layerName(0, key.startsWith("--") ? 0 : depthOf(key));
          expect(compileValue(key, value, layer), `${key}: ${value}`).toEqual(compiled(compileEntry(key, value)));
        }
      }
      // A key holding an object is a selector, which needs the compiler that only the full entries load.
      expect(() => compileValue("span", { color: "red" }, "n0")).toThrow(/only @nishikijs\/react\/lean/);
      register();
      expect(compileValue("span", { color: "red" }, "n0")).toEqual(compiled(compileEntry("span", { color: "red" })));
    });

    it("rejects at-rules that cannot hold style rules, wherever they are nested", () => {
      for (const [key, value] of [
        ["@keyframes spin", { from: { rotate: "0deg" } }],
        ["@font-face", { fontFamily: "Inter" }],
        [" @property --x", { syntax: "'<length>'" }],
        ["@page", { margin: 0 }],
        ["@counter-style thumbs", { system: "cyclic" }],
        ["@font-feature-values Inter", { "@styleset": { nice: 1 } }],
        ["@-webkit-keyframes spin", {}],
        ["@import", "url(theme.css)"],
        ["@", { color: "red" }],
      ] as const) {
        expect(() => compileEntry(key, value), key).toThrow(
          /^\[nishiki\] ".+" cannot hold styles: only @media, .+ plain stylesheet/,
        );
        expect(() => compileEntry(":hover", { [key]: value }), key).toThrow(/^\[nishiki\] /);
      }
      expect(() => compileEntry("@keyframes spin", {})).toThrow(/write @keyframes in a plain stylesheet/);
      for (const key of ["@media print", "@supports (display: grid)", "@container (width > 1px)", "@scope (.a)"]) {
        expect(rulesOf(key, { color: "red" }), key).toHaveLength(1);
      }
      expect(rulesOf("@starting-style", { opacity: 0 })).toHaveLength(1);
      expect(rulesOf("@layer base", { color: "red" })).toHaveLength(1);
      expect(rulesOf("@MEDIA print", { color: "red" })).toHaveLength(1);
    });

    it("reports a rejected at-rule to a listener that does not throw, and drops it", () => {
      const notices: Notice[] = [];
      const entries = compileEntry(
        ":hover",
        { "@keyframes spin": { from: { opacity: 0 } }, color: "red" },
        {
          table: activeTable(),
          notify: (notice) => notices.push(notice),
        },
      );
      expect(notices).toEqual([{ atRule: "@keyframes spin" }]);
      expect(entries[0]![2]).toHaveLength(1);
    });

    it("skips nullish values", () => {
      expect(compileEntry("color", null)).toEqual([["color", "", []]]);
    });

    it("declares every layer it can emit, in rank order", () => {
      const table = activeTable();
      const names = /^@layer nishiki\{@layer ([^;]+);\}$/.exec(layerOrder())![1]!.split(",");
      expect(names).toHaveLength(2 * table.size + 1);
      expect(names.map(rankOfLayer)).toEqual(names.map((_, index) => index));
    });
  });

  const declarationOf = (key: string, value: unknown) => /\{([^{}]*)\}+$/.exec(rulesOf(key, value)[0]!)![1];

  describe("runtime configuration", () => {
    afterEach(() => {
      compiledWith = undefined;
      configure({});
      vi.restoreAllMocks();
    });

    it("ranks with the conditions the build plugin hands the runtime", () => {
      const options = { breakpoints: ["600px"] };
      setConditions(options, createTable(options).size);
      expect(activeTable()).toEqual(createTable(options));
      expect(layerOrder().split(",")).toHaveLength(2 * createTable(options).size + 1);
    });

    it("reports configuring after styles were compiled with other conditions", () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      compileEntry("color", "red");
      configure({});
      expect(error).not.toHaveBeenCalled();
      configure({ breakpoints: ["600px"] });
      expect(error).toHaveBeenCalledWith(expect.stringContaining("configure() was called after styles were compiled"));
      expect(layerOrder().split(",")).toHaveLength(2 * createTable({ breakpoints: ["600px"] }).size + 1);
    });

    it("loads and compiles without a `process` global, as a browser does when the bundler defines nothing", async () => {
      const { build } = await import("esbuild");
      const { runInNewContext } = await import("node:vm");
      const { outputFiles } = await build({
        entryPoints: [new URL("./index.ts", import.meta.url).pathname],
        bundle: true,
        write: false,
        format: "iife",
        globalName: "nishiki",
        define: { "import.meta.vitest": "undefined" },
      });
      const warnings: unknown[] = [];
      const context = { console: { warn: (...args: unknown[]) => warnings.push(args), error: () => {} } };
      runInNewContext(outputFiles[0]!.text, context);
      const nishiki = (context as unknown as { nishiki: typeof import("./index.ts") }).nishiki;
      nishiki.configure({ breakpoints: ["600px"] });
      expect(nishiki.compileEntry(".no-process &", { color: "red !important" })[0]![2]).toHaveLength(1);
      expect(warnings).toEqual([]);
    });

    it("warns once per unranked condition and !important value", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      compileEntry(".warned-once &", { color: "red !important" });
      compileEntry(".warned-once &", { color: "red !important" });
      expect(warn.mock.calls).toEqual([
        [expect.stringContaining('"color: red !important" is !important')],
        [expect.stringContaining('".warned-once &" is not in conditions.order')],
      ]);
    });
  });

  describe("unitless numbers", () => {
    // Ported from facebook/stylex packages/@stylexjs/babel-plugin/src/shared/utils/transform-value.js
    // (`unitlessNumberProperties`). StyleX also lists `rotate`, which takes an angle and is invalid both
    // with and without px, and `strokeWidth`, `strokeDasharray` and `strokeDashoffset`, which take
    // lengths, so nishiki keeps px for those.
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
  // The layer is left out: the layer tests above cover it.
  const shapesOf = (key: string, value: unknown) =>
    compileEntry(key, value).flatMap(([, , rules]) =>
      rules.map(([className, text]) => text.replaceAll(className, "x").replace(/^@layer [^{]+\{([\s\S]*)\}$/, "$1")),
    );

  describe("values", () => {
    // Ported from facebook/stylex packages/@stylexjs/babel-plugin/__tests__/transform-value-normalization-test.js
    it("adds px to numbers for properties that take lengths", () => {
      expect(shapesOf("height", 500)).toEqual([".x{height:500px}"]);
      expect(shapesOf("margin", 10)).toEqual([".x{margin:10px}"]);
      expect(shapesOf("width", 500)).toEqual([".x{width:500px}"]);
      // StyleX emits a bare `0`; nishiki treats zero like any other number.
      expect(shapesOf("marginLeft", 0)).toEqual([".x{margin-left:0px}"]);
    });

    it("leaves numbers unitless for unitless properties", () => {
      // StyleX also strips leading zeros (`.545`); nishiki prints numbers the way JavaScript does.
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
    // and quotes `content`. nishiki emits strings exactly as written, so the CSS is what the author typed.
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
      expect(shapesOf(":hover", { color: null, background: false, margin: 0 })).toEqual([".x:hover{margin:0px}"]);
    });

    it("gives the same declaration different classes under different conditions", () => {
      const plain = compileEntry("color", "red")[0]![1];
      const hovered = compileEntry(":hover", { color: "red" })[0]![1];
      const media = compileEntry("@media print", { color: "red" })[0]![1];
      expect(new Set([plain, hovered, media]).size).toBe(3);
      expect(compileEntry("&:hover", { color: "red" })[0]![1]).toBe(hovered);
    });

    it("gives a declaration the class of its layer, which a bare `&` leaves as it is", () => {
      // A class names its layer, so a merge that keeps one rule per class cannot drop a rule in another layer.
      expect(compileEntry("&", { color: "red" })[0]![1]).toBe(compileEntry("color", "red")[0]![1]);
      expect(compileEntry("&", { color: "red" })[0]![2]).toEqual(compileEntry("color", "red")[0]![2]);
    });
  });

  describe("selectors", () => {
    // Ported from facebook/stylex packages/@stylexjs/babel-plugin/__tests__/transform-stylex-create-test.js
    it("compiles pseudo-classes one level deeper", () => {
      expect(shapesOf(":hover", { backgroundColor: "red", color: "blue" })).toEqual([
        ".x:hover{background-color:red}",
        ".x:hover{color:blue}",
      ]);
      expect(shapesOf(":focus-visible", { outline: "2px solid" })).toEqual([".x:focus-visible{outline:2px solid}"]);
    });

    it("compiles pseudo-elements", () => {
      expect(shapesOf("::before", { color: "red" })).toEqual([".x::before{color:red}"]);
      expect(shapesOf("::after", { color: "blue" })).toEqual([".x::after{color:blue}"]);
      expect(shapesOf("::placeholder", { color: "gray" })).toEqual([".x::placeholder{color:gray}"]);
    });

    it("compiles compound pseudo selectors given as one key", () => {
      expect(shapesOf(":hover::after", { color: "red" })).toEqual([".x:hover::after{color:red}"]);
      expect(shapesOf("&:hover::before", { color: "blue" })).toEqual([".x:hover::before{color:blue}"]);
    });

    it("appends nested pseudo selectors in nesting order", () => {
      // StyleX hoists pseudo-classes nested in `::before` in front of it (`:hover::before`).
      // nishiki nests selectors literally, so a pseudo-class on the element is written as `:hover::before`.
      expect(shapesOf("::before", { ":hover": { color: "blue" } })).toEqual([".x::before:hover{color:blue}"]);
      expect(shapesOf(":hover", { ":focus": { color: "red" } })).toEqual([".x:hover:focus{color:red}"]);
    });

    it("wraps declarations in media, supports and container queries", () => {
      // StyleX repeats the class (`.x.x`) to raise specificity inside at-rules; nishiki uses a deeper layer.
      expect(shapesOf("@media (min-width: 1000px)", { backgroundColor: "blue" })).toEqual([
        "@media (min-width: 1000px){.x{background-color:blue}}",
      ]);
      expect(shapesOf("@supports not (hover: hover)", { backgroundColor: "purple" })).toEqual([
        "@supports not (hover: hover){.x{background-color:purple}}",
      ]);
      expect(shapesOf("@container sidebar (min-width: 400px)", { padding: 8 })).toEqual([
        "@container sidebar (min-width: 400px){.x{padding:8px}}",
      ]);
    });

    it("combines media queries with pseudo-classes", () => {
      expect(shapesOf("@media (min-width: 800px)", { fontSize: "2rem", ":hover": { fontSize: "2.2rem" } })).toEqual([
        "@media (min-width: 800px){.x{font-size:2rem}}",
        "@media (min-width: 800px){.x:hover{font-size:2.2rem}}",
      ]);
    });

    it("nests at-rules outermost first", () => {
      expect(shapesOf("@supports (display: grid)", { "@media (min-width: 600px)": { display: "grid" } })).toEqual([
        "@supports (display: grid){@media (min-width: 600px){.x{display:grid}}}",
      ]);
      expect(shapesOf(":hover", { "@media (hover: hover)": { color: "red" } })).toEqual([
        "@media (hover: hover){.x:hover{color:red}}",
      ]);
    });

    it("stops raising the layer below the deepest nesting level", () => {
      const deep = { ":a": { ":b": { ":c": { ":d": { color: "red", margin: 0 } } } } };
      expect(shapesOf(":root", deep)).toEqual([".x:root:a:b:c:d{color:red}", ".x:root:a:b:c:d{margin:0px}"]);
    });

    it("resolves selector lists, ampersands and descendants", () => {
      expect(shapesOf(":hover, :focus", { color: "red" })).toEqual([".x:hover{color:red}", ".x:focus{color:red}"]);
      expect(shapesOf(".parent &", { color: "red" })).toEqual([".parent .x{color:red}"]);
      expect(shapesOf("& + &", { margin: 0 })).toEqual([".x + .x{margin:0px}"]);
      expect(shapesOf("span", { color: "red" })).toEqual([".x span{color:red}"]);
      expect(shapesOf('&[data-state="open"]', { color: "red" })).toEqual(['.x[data-state="open"]{color:red}']);
      expect(shapesOf(":is(a, b)", { color: "red" })).toEqual([".x:is(a, b){color:red}"]);
    });

    it("multiplies nested selector lists, a rule per selector", () => {
      expect(shapesOf(":hover", { "& span, & em": { color: "red" } })).toEqual([
        ".x:hover span{color:red}",
        ".x:hover em{color:red}",
      ]);
      expect(shapesOf(":hover, :focus", { "& span, & em": { color: "red" } })).toEqual([
        ".x:hover span{color:red}",
        ".x:hover em{color:red}",
        ".x:focus span{color:red}",
        ".x:focus em{color:red}",
      ]);
    });

    it("scopes every part of a list that mixes ampersands with plain parts", () => {
      expect(shapesOf("&:hover, span", { color: "red" })).toEqual([".x:hover{color:red}", ".x span{color:red}"]);
      expect(shapesOf(".dark &, :focus", { color: "red" })).toEqual([".dark .x{color:red}", ".x:focus{color:red}"]);
      expect(shapesOf("&:hover, span", { ":focus": { color: "red" } })).toEqual([
        ".x:hover:focus{color:red}",
        ".x span:focus{color:red}",
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
      expect(shapesOf("\n@media print, screen", { color: "red" })).toEqual(["@media print, screen{.x{color:red}}"]);
    });

    it("keeps an escaped comma, bracket or quote inside its selector", () => {
      expect(entryKeys("--a\\,b")).toEqual(["--a\\,b"]);
      expect(declarationOf("--a\\,b", "red")).toBe("--a\\,b:red");
      expect(entryKeys(".a\\,b, span")).toEqual([".a\\,b", "span"]);
      expect(entryKeys(".a\\(, span")).toEqual([".a\\(", "span"]);
      expect(entryKeys(".a\\', span")).toEqual([".a\\'", "span"]);
      expect(entryKeys(".a\\\\, span")).toEqual([".a\\\\", "span"]);
      expect(entryKeys(".a\\  , span")).toEqual([".a\\ ", "span"]);
      expect(entryKeys(".a\\\\ , span")).toEqual([".a\\\\", "span"]);
    });

    it("trims only CSS whitespace, since a no-break space is part of a name", () => {
      expect(entryKeys("--theme\u00a0")).toEqual(["--theme\u00a0"]);
      expect(declarationOf("--theme\u00a0", "red")).toBe("--theme\u00a0:red");
      expect(entryKeys("\u00a0span, em")).toEqual(["\u00a0span", "em"]);
    });

    it("recognises a nested at-rule written with surrounding whitespace", () => {
      expect(shapesOf(":hover", { " @media print, screen": { color: "red" } })).toEqual([
        "@media print, screen{.x:hover{color:red}}",
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
        ".dark .x:hover{color:red}",
        ".x:hover + .x:hover{margin:0px}",
      ]);
      expect(shapesOf("&:hover, & span", { ".dark &": { color: "red" } })).toEqual([
        ".dark .x:hover{color:red}",
        ".dark .x span{color:red}",
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
      ).toEqual(["@media print{.x{padding:1px}}", "@media print{.x:hover{color:blue}}"]);
      const [, className, rules] = compileEntry(":hover", { "& span": { color: "red" }, span: { color: "blue" } })[0]!;
      expect(className.split(" ")).toEqual(rules.map(([ruleClass]) => ruleClass));
      expect(rules).toHaveLength(1);
    });

    it("keeps declarations of one property under different conditions", () => {
      expect(
        shapesOf(":hover", { color: "red", ":focus": { color: "blue" }, "@media print": { color: "green" } }),
      ).toEqual([".x:hover{color:red}", ".x:hover:focus{color:blue}", "@media print{.x:hover{color:green}}"]);
    });
  });
}
