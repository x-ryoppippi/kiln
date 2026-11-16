import { layerName } from "./config.ts";
import { trimWhitespace } from "./utils.ts";

/** How kiln ranks the conditions a rule applies under. */
export interface ConditionOptions {
  /**
   * The widths of the breakpoint ladder, in `px`, `rem` or `em` (16px each). `(min-width)` and `(width >=)` queries at
   * these widths rank in ascending order, above every `(max-width)` and `(width <)` query, which rank in descending
   * order. Defaults to `["40rem", "48rem", "64rem", "80rem", "96rem"]`.
   */
  breakpoints?: readonly string[];
  /**
   * Conditions in rank order, lowest first, such as `"@media print"`, `"@container (min-width: 400px)"`,
   * `"[data-state=open]"`, `".dark &"` or `":hover"`. A category listed here (media, container, supports and other
   * at-rules, attributes and ancestors, pseudo-classes) replaces kiln's default order for it.
   */
  order?: readonly string[];
  /** Fail the build on a condition the order does not rank, instead of warning. */
  strict?: boolean;
}

// The order categories rank in, lowest first.
const MEDIA = 0;
const CONTAINER = 1;
const SUPPORTS = 2;
const SELECTOR = 3;
const PSEUDO = 4;
const CATEGORIES = 5;

/** A condition a rule applies under: its category and canonical key. */
export type Condition = readonly [category: number, key: string];

// Tailwind CSS's breakpoints, in px.
const BREAKPOINTS = [640, 768, 1024, 1280, 1536];
// Tailwind CSS v4's variant order for the variants that map onto one condition, by category, as canonical keys; media
// queries other than widths follow the breakpoint ladder.
const ORDER = [
  "hover:hover|prefers-reduced-motion:no-preference|prefers-reduced-motion:reduce|prefers-contrast:more|" +
    "prefers-contrast:less|orientation:portrait|orientation:landscape|prefers-color-scheme:dark|print|forced-colors:active",
  "",
  "@starting-style",
  "open|inert|" +
    "busy|checked|disabled|expanded|hidden|pressed|readonly|required|selected".replace(/\w+/g, "aria-$&=true"),
  "first-child|last-child|only-child|nth-child(odd)|nth-child(even)|first-of-type|last-of-type|only-of-type|visited|" +
    "target|popover-open|open|default|checked|indeterminate|placeholder-shown|autofill|optional|required|valid|" +
    "invalid|user-valid|user-invalid|in-range|out-of-range|read-only|empty|focus-within|hover|focus|focus-visible|" +
    "active|enabled|disabled",
];

// The canonical key of a default order entry.
const defaultKey = (category: number, entry: string): string =>
  category === MEDIA
    ? "@media " + entry.replace(/(.+):(.+)/, "($1: $2)")
    : category === SELECTOR
      ? "[" + entry + "]"
      : category === PSEUDO
        ? ":" + entry
        : entry;

const QUOTED = /("|')((?:\\.|(?!\1).)*)\1/g;

// Collapses whitespace outside strings, and around brackets and colons in at-rule preludes.
function tidy(text: string, prelude: boolean): string {
  let result = "";
  let last = 0;
  const squeeze = (part: string) => {
    part = part.replace(/[ \t\n\r\f]+/g, " ").replace(/([([]) | (?=[)\]])/g, "$1");
    return prelude ? part.replace(/ ?: ?/g, ": ") : part;
  };
  for (const match of text.matchAll(QUOTED)) {
    result += squeeze(text.slice(last, match.index)) + match[0];
    last = match.index + match[0].length;
  }
  return trimWhitespace(result + squeeze(text.slice(last)));
}

// `[data-state="open"]` and `[data-state=open]` select the same elements.
const unquote = (simple: string) =>
  simple[0] === "[" ? simple.replace(/=(["'])(-?[_a-zA-Z][\w-]*)\1/, "=$2") : simple;

/** The canonical key of an at-rule condition such as `@media (min-width:600px)`. */
export function atRuleKey(rule: string): string {
  const [, name = "", prelude = ""] = /^(@[\w-]+)[ \t\n\r\f]*([\s\S]*)$/.exec(trimWhitespace(rule)) ?? [];
  return name.toLowerCase() + (prelude ? " " + tidy(prelude, true) : "");
}

const atRuleCategory = (key: string) =>
  key.startsWith("@media ") ? MEDIA : key.startsWith("@container ") ? CONTAINER : SUPPORTS;

// A selector's tokens: an escape, a string, or one character.
const TOKEN = /\\(?:[\da-f]{1,6}[ \t\n\r\f]?|[^])|(["'])(?:\\[^]|(?!\1)[^])*\1?|[^]/gi;

// Calls `visit` with each token of a selector and the bracket depth around it.
function walk(text: string, visit: (token: string, depth: number) => void): void {
  let depth = 0;
  for (const [token] of text.matchAll(TOKEN)) {
    if (token === ")" || token === "]") depth--;
    visit(token, depth);
    if (token === "(" || token === "[") depth++;
  }
}

// The compounds of a complex selector, each with the combinator before it: "", " ", ">", "+" or "~".
function compoundsOf(selector: string): [combinator: string, compound: string][] {
  const compounds: [string, string][] = [];
  let combinator = "";
  let current = "";
  walk(selector, (token, depth) => {
    if (depth === 0 && /^[ \t\n\r\f>+~]$/.test(token)) {
      if (current) {
        compounds.push([combinator, current]);
        current = combinator = "";
      }
      combinator = /[ \t\n\r\f]/.test(token) ? combinator || " " : token;
    } else {
      current += token;
    }
  });
  if (current) compounds.push([combinator, current]);
  return compounds;
}

// The simple selectors of a compound.
function simplesOf(compound: string): string[] {
  const simples: string[] = [];
  let current = "";
  walk(compound, (token, depth) => {
    if (depth === 0 && current && (/^[.#[&]$/.test(token) || (token === ":" && !current.endsWith(":")))) {
      simples.push(current);
      current = "";
    }
    current += token;
  });
  if (current) simples.push(current);
  return simples;
}

const PSEUDO_ELEMENT = /^::|^:(before|after|first-line|first-letter)$/i;

/**
 * The conditions of one selector, `&` standing for the element: what precedes the compound holding the element, and
 * the simple selectors on it other than pseudo-elements. Compounds after it pick the target, not a condition.
 */
export function selectorConditions(selector: string): Condition[] {
  const compounds = compoundsOf(trimWhitespace(selector)).map(
    ([combinator, compound]) => [combinator, simplesOf(compound)] as const,
  );
  const at = compounds.findLastIndex(([, simples]) => simples.includes("&"));
  if (at < 0) return [];
  const conditions: Condition[] = [];
  if (at > 0) {
    let context = "";
    for (const [index, [combinator, simples]] of compounds.slice(0, at + 1).entries()) {
      if (index > 0) context += combinator === " " ? " " : " " + combinator + " ";
      context += index === at ? "&" : simples.map(unquote).join("");
    }
    conditions.push([SELECTOR, tidy(context, false)]);
  }
  for (const simple of compounds[at]![1]) {
    if (simple === "&" || PSEUDO_ELEMENT.test(simple)) continue;
    conditions.push(simple[0] === ":" ? [PSEUDO, tidy(simple, false)] : [SELECTOR, unquote(tidy(simple, false))]);
  }
  return conditions;
}

/** The conditions of a rule: its at-rules, outermost first, then those of its selector. */
export function conditionsOf(selector: string, atRules: readonly string[]): Condition[] {
  return [
    ...atRules.map((rule): Condition => {
      const key = atRuleKey(rule);
      return [atRuleCategory(key), key];
    }),
    ...selectorConditions(selector),
  ];
}

// A query on the viewport width at one of the ladder's widths, as `min:<px>` or `max:<px>`, or else the key itself.
function slotOf(key: string): string {
  const match =
    /^@media \((min|max)-width: ([\d.]+)(px|r?em)\)$/.exec(key) ??
    /^@media \(width ?(>=|<) ?([\d.]+)(px|r?em)\)$/.exec(key);
  return match ? (match[1] === "min" || match[1] === ">=" ? "min:" : "max:") + toPx(match[2]!, match[3]!) : key;
}

const toPx = (value: string, unit: string) => +value * (unit === "px" ? 1 : 16);

function breakpointOf(width: string): number {
  const match = /^([\d.]+)(px|r?em)$/.exec(trimWhitespace(width));
  if (!match)
    throw new Error(`[kiln] conditions.breakpoints: ${JSON.stringify(width)} is not a width in px, rem or em`);
  return toPx(match[1]!, match[2]!);
}

/** The ranks of one configuration, shared by the build, the server and the browser. */
export interface Table {
  /** The number of single-condition ranks; compound conditions take as many again above them. */
  readonly size: number;
  /** The rank of each condition the order names, by canonical key, widths on the ladder as `min:<px>` or `max:<px>`. */
  readonly ranks: ReadonlyMap<string, number>;
  /** The rank conditions the order does not name share, by category. */
  readonly unranked: readonly number[];
}

// An order entry: one at-rule, or one selector condition written with or without `&`.
function entryCondition(entry: string): Condition {
  const text = trimWhitespace(entry);
  if (text[0] === "@") {
    const key = atRuleKey(text);
    return [atRuleCategory(key), key];
  }
  const conditions = selectorConditions(text.includes("&") ? text : "&" + text);
  if (conditions.length !== 1)
    throw new Error(`[kiln] conditions.order: ${JSON.stringify(entry)} is not one condition`);
  return conditions[0]!;
}

/** Build the ranks of a configuration. Throws on an order entry that is not exactly one condition, or a bad width. */
export function createTable(options: ConditionOptions = {}): Table {
  const entries = (options.order ?? []).map(entryCondition);
  const ranks = new Map<string, number>();
  const unranked: number[] = [];
  let rank = 1;
  const add = (slot: string) => ranks.has(slot) || ranks.set(slot, rank++);
  for (let category = 0; category < CATEGORIES; category++) {
    if (category === MEDIA) {
      const widths = [...new Set(options.breakpoints?.map(breakpointOf) ?? BREAKPOINTS)].sort((a, b) => a - b);
      for (const width of [...widths].reverse()) add("max:" + width);
      for (const width of widths) add("min:" + width);
    }
    const own = entries.filter(([of]) => of === category).map(([, key]) => key);
    const keys =
      own.length > 0
        ? own
        : ORDER[category]!.split("|")
            .filter(Boolean)
            .map((entry) => defaultKey(category, entry));
    for (const key of keys) add(slotOf(key));
    unranked.push(rank++);
  }
  return { size: rank - 1, ranks, unranked };
}

/**
 * The rank of a rule under `conditions`: 0 with none, a condition's own rank with one, and with more, the rank of the
 * highest of them in a second band above every single condition. `unranked` hears of each condition the order misses.
 */
export function rankOf(
  table: Table,
  conditions: readonly Condition[],
  unranked?: (condition: Condition) => void,
): number {
  let highest = 0;
  for (const condition of conditions) {
    let rank = table.ranks.get(slotOf(condition[1]));
    if (rank === undefined) {
      unranked?.(condition);
      rank = table.unranked[condition[0]]!;
    }
    if (rank > highest) highest = rank;
  }
  return conditions.length > 1 ? table.size + highest : highest;
}

/** The rank of a layer name as `layerName` writes it. */
export const rankOfLayer = (name: string): number => parseInt(name.slice(1), 36);

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;
  const { DEFAULT_SIZE } = await import("./config.ts");

  const table = createTable();
  const rank = (selector: string, atRules: string[] = [], of = table) => rankOf(of, conditionsOf(selector, atRules));
  const media = (query: string, of = table) => rank("&", ["@media " + query], of);

  describe("canonical conditions", () => {
    it("collapses whitespace and spaces at-rule preludes one way", () => {
      expect(atRuleKey("@media   (min-width:600px)")).toBe("@media (min-width: 600px)");
      expect(atRuleKey("@MEDIA ( min-width : 600px )")).toBe("@media (min-width: 600px)");
      expect(atRuleKey('@supports (content: "a  b")')).toBe('@supports (content: "a  b")');
      expect(atRuleKey("@starting-style")).toBe("@starting-style");
      expect(selectorConditions("&[title=a\u00a0\u00a0b]")).toEqual([[SELECTOR, "[title=a\u00a0\u00a0b]"]]);
    });

    it("resolves the element, its own pseudo-classes and attributes, and its context", () => {
      expect(selectorConditions("&")).toEqual([]);
      expect(selectorConditions("&:hover")).toEqual([[PSEUDO, ":hover"]]);
      expect(selectorConditions('&[data-state="open"]')).toEqual([[SELECTOR, "[data-state=open]"]]);
      expect(selectorConditions("&[data-state='a b']")).toEqual([[SELECTOR, "[data-state='a b']"]]);
      expect(selectorConditions(".dark  &:hover")).toEqual([
        [SELECTOR, ".dark &"],
        [PSEUDO, ":hover"],
      ]);
      expect(selectorConditions(".a>.b   &")).toEqual([[SELECTOR, ".a > .b &"]]);
      expect(selectorConditions("& + &")).toEqual([[SELECTOR, "& + &"]]);
      expect(selectorConditions("&:not( .x ,.y )")).toEqual([[PSEUDO, ":not(.x ,.y)"]]);
    });

    it("leaves pseudo-elements and descendants to pick the target", () => {
      expect(selectorConditions("&::before")).toEqual([]);
      expect(selectorConditions("&:after")).toEqual([]);
      expect(selectorConditions("&:hover::before")).toEqual([[PSEUDO, ":hover"]]);
      expect(selectorConditions("& span:hover")).toEqual([]);
      expect(selectorConditions("&:focus > li")).toEqual([[PSEUDO, ":focus"]]);
    });

    it("keeps escapes and strings whole", () => {
      expect(selectorConditions(".\\31  &")).toEqual([[SELECTOR, ".\\31 &"]]);
      expect(selectorConditions('[title="a &:hover"] &')).toEqual([[SELECTOR, '[title="a &:hover"] &']]);
      expect(selectorConditions("&.a\\:hover")).toEqual([[SELECTOR, ".a\\:hover"]]);
    });

    it("puts at-rules first, outermost first", () => {
      expect(conditionsOf("&:hover", ["@supports (display: grid)", "@media print"])).toEqual([
        [SUPPORTS, "@supports (display: grid)"],
        [MEDIA, "@media print"],
        [PSEUDO, ":hover"],
      ]);
      expect(conditionsOf("&", ["@container card (min-width: 1px)", "@scope (.a)"])).toEqual([
        [CONTAINER, "@container card (min-width: 1px)"],
        [SUPPORTS, "@scope (.a)"],
      ]);
    });
  });

  it("writes its default order as the canonical keys conditions parse to", () => {
    for (const [category, keys] of ORDER.entries()) {
      for (const key of keys.split("|").filter(Boolean)) {
        const written = defaultKey(category, key);
        expect(entryCondition(written)).toEqual([category, written]);
      }
    }
  });

  describe("ranks", () => {
    it("ranks no condition lowest", () => {
      expect(rank("&")).toBe(0);
      expect(rank("&::before")).toBe(0);
    });

    it("ladders max-width queries descending below min-width queries ascending", () => {
      const ladder = [
        "(max-width: 96rem)",
        "(width < 80rem)",
        "(max-width: 1024px)",
        "(max-width: 48rem)",
        "(max-width: 40rem)",
        "(min-width: 40rem)",
        "(width >= 768px)",
        "(min-width: 64rem)",
        "(min-width: 80rem)",
        "(min-width: 96rem)",
      ].map((query) => media(query));
      expect(ladder).toEqual([...ladder].sort((a, b) => a - b));
      expect(new Set(ladder).size).toBe(ladder.length);
      expect(media("(min-width: 640px)")).toBe(media("(width >= 40rem)"));
    });

    it("ladders the configured breakpoints, and only those", () => {
      const custom = createTable({ breakpoints: ["900px", "600px"] });
      expect(media("(min-width: 600px)", custom)).toBeLessThan(media("(min-width: 900px)", custom));
      expect(media("(max-width: 900px)", custom)).toBeLessThan(media("(max-width: 600px)", custom));
      expect(media("(max-width: 600px)", custom)).toBeLessThan(media("(min-width: 600px)", custom));
      expect(media("(min-width: 40rem)", custom)).toBe(media("(min-width: 1px)", custom));
    });

    it("orders categories: media, container, supports, attributes and ancestors, pseudo-classes", () => {
      const order = [
        media("(min-width: 96rem)"),
        media("print"),
        media("(min-width: 1px)"),
        rank("&", ["@container (min-width: 1px)"]),
        rank("&", ["@supports (display: grid)"]),
        rank("&[aria-selected=true]"),
        rank(".dark &"),
        rank("&:first-child"),
        rank("&:disabled"),
      ];
      expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it("follows Tailwind CSS's order for pseudo-classes", () => {
      const order = ["&:first-child", "&:visited", "&:focus-within", "&:hover", "&:focus", "&:focus-visible"];
      const ranks = order.map((selector) => rank(selector));
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
      expect(new Set(ranks).size).toBe(ranks.length);
    });

    it("puts every condition the order misses in one slot per category, so the layers stay the same", () => {
      const heard: Condition[] = [];
      const unranked = (selector: string, atRules: string[] = []) =>
        rankOf(table, conditionsOf(selector, atRules), (condition) => heard.push(condition));
      expect(unranked(".a &")).toBe(unranked(".b &"));
      expect(unranked("&:has(img)")).toBe(unranked("&:is(a)"));
      expect(unranked("&", ["@media (min-width: 1px)"])).toBe(unranked("&", ["@media screen"]));
      expect(unranked("&:has(img)")).toBeGreaterThan(rank("&:disabled"));
      expect(heard.map(([, key]) => key)).toEqual([
        ".a &",
        ".b &",
        ":has(img)",
        ":is(a)",
        "@media (min-width: 1px)",
        "@media screen",
        ":has(img)",
      ]);
      expect([table.size, table.unranked]).toEqual([createTable().size, createTable().unranked]);
    });

    it("ranks a compound path by its highest condition, above every single condition", () => {
      const top = 2 * table.size;
      expect(rank("&:hover:focus")).toBe(table.size + rank("&:focus"));
      expect(rank("&:hover", ["@media print"])).toBe(table.size + rank("&:hover"));
      expect(rank("&:hover", ["@media print"])).toBeGreaterThan(rank("&:disabled"));
      expect(rank("&:has(a):hover")).toBeLessThanOrEqual(top);
      expect(rank("&:has(a):hover")).toBe(table.size + table.unranked[PSEUDO]!);
    });

    it("lets the order replace a category's defaults, and only that category's", () => {
      const custom = createTable({ order: ["&:focus", ":hover", ".dark &", "@container (min-width: 1px)"] });
      expect(rank("&:focus", [], custom)).toBeLessThan(rank("&:hover", [], custom));
      expect(rank("&:active", [], custom)).toBe(custom.unranked[PSEUDO]);
      expect(rank(".dark &", [], custom)).toBeLessThan(custom.unranked[SELECTOR]!);
      expect(rank("&[aria-selected=true]", [], custom)).toBe(custom.unranked[SELECTOR]);
      expect(media("print", custom)).toBeLessThan(custom.unranked[MEDIA]!);
      expect(() => createTable({ order: [":hover:focus"] })).toThrow(/not one condition/);
    });
  });

  describe("tables", () => {
    it("rank the default conditions in as many ranks as the runtime declares without ranking them", () => {
      expect(table.size).toBe(DEFAULT_SIZE);
      expect(createTable({ breakpoints: ["40rem", "48rem", "64rem", "80rem", "96rem"] }).ranks).toEqual(table.ranks);
    });

    it("reject a breakpoint that is not a width in px, rem or em", () => {
      for (const width of ["600", "abc", "10vw", ""]) {
        expect(() => createTable({ breakpoints: [width] }), width).toThrow(/not a width in px, rem or em/);
      }
      expect(createTable({ breakpoints: [" 37.5rem ", "600px"] }).size).toBe(table.size - 8);
    });

    it("name layers so their rank reads back", () => {
      expect(rankOfLayer(layerName(40, 3))).toBe(40);
    });
  });
}
