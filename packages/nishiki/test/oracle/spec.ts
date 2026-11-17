// What nishiki promises an element computes to, written from the README's rules rather than from nishiki's code: inputs
// merge per top-level key, later inputs winning; of the declarations that apply, the one under the higher-ranked
// condition wins, with a path of several conditions ranked by its highest condition above every single condition; at
// the same rank the narrower property wins: a shorthand loses to the shorthands and longhands it covers, a logical
// longhand to its physical counterpart. It covers the vocabulary below, with nishiki's default conditions.
import { expand, type ElementState } from "./cascade.ts";

// Ranked conditions in their documented order, lowest first: media queries (the breakpoint ladder, max-width queries
// descending below min-width queries ascending, then other media), then attributes, then pseudo-classes.
export const RANKED = [
  "@media (max-width: 48rem)",
  "@media (max-width: 40rem)",
  "@media (min-width: 40rem)",
  "@media (min-width: 48rem)",
  "@media (min-width: 64rem)",
  "@media (prefers-color-scheme: dark)",
  "&[aria-expanded=true]",
  "&[aria-selected=true]",
  ":hover",
  ":focus",
  ":active",
  ":disabled",
] as const;
export type Condition = (typeof RANKED)[number];

// How narrow each property is: a property beats any lower one that sets the same longhand.
export const NARROWNESS: Record<string, number> = {
  padding: 0,
  margin: 0,
  paddingInline: 1,
  paddingBlock: 1,
  marginInline: 1,
  paddingInlineStart: 2,
  paddingBlockStart: 2,
  marginInlineEnd: 2,
  paddingLeft: 3,
  paddingTop: 3,
  marginRight: 3,
  color: 3,
};

const kebab = (property: string) => property.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase());

/** A style object of this vocabulary: properties, conditions holding properties, or a media query holding a pseudo-class. */
export type Style = Record<string, unknown>;

// `&:hover` selects what `:hover` does, and the README has the two keys merge as one.
const canonical = (key: string) => (key.startsWith("&:") && !key.includes("&", 1) ? key.slice(1) : key);

function holds(condition: string, state: ElementState): boolean {
  if (condition.startsWith(":")) return state.pseudo?.has(condition.slice(1)) ?? false;
  if (condition.startsWith("&[")) {
    const [, name, value] = /^&\[([\w-]+)=(.*)\]$/.exec(condition)!;
    return state.attributes?.[name!] === value;
  }
  const query = condition.slice("@media ".length);
  const width = /^\((min|max)-width: ([\d.]+)rem\)$/.exec(query);
  if (width) return width[1] === "min" ? state.width >= Number(width[2]) * 16 : state.width <= Number(width[2]) * 16;
  return state.media?.has(query.slice(1, -1)) ?? false;
}

// One input's keys as JavaScript holds them, then later inputs replacing a key and moving it last.
function merge(inputs: readonly Style[]): Map<string, unknown> {
  const merged = new Map<string, unknown>();
  for (const input of inputs) {
    for (const [written, value] of Object.entries(input)) {
      const key = canonical(written);
      merged.delete(key);
      if (value !== null && value !== undefined) merged.set(key, value);
    }
  }
  return merged;
}

/** The value each longhand of the vocabulary computes to on an element styled with `inputs`, in `state`. */
export function expected(inputs: readonly Style[], state: ElementState): Record<string, string> {
  const best = new Map<string, { rank: number; narrowness: number; value: string }>();
  const consider = (conditions: string[], property: string, value: unknown) => {
    // nishiki compiles only strings and numbers, and skips `false` and anything else.
    if (typeof value !== "string" && typeof value !== "number") return;
    // Unlisted conditions share a rank that the order of their rules decides, which no spec of the cascade can predict.
    for (const condition of conditions) {
      if (!RANKED.includes(condition as Condition)) throw new Error(`${condition} is outside the oracle's vocabulary`);
    }
    if (!(property in NARROWNESS)) throw new Error(`${property} is outside the oracle's vocabulary`);
    if (!conditions.every((condition) => holds(condition, state))) return;
    const ranks = conditions.map((condition) => RANKED.indexOf(condition as Condition) + 1);
    const rank = conditions.length === 0 ? 0 : conditions.length === 1 ? ranks[0]! : RANKED.length + Math.max(...ranks);
    const text = typeof value === "number" ? value + "px" : String(value);
    for (const [longhand, longhandValue] of expand(kebab(property), text)) {
      const current = best.get(longhand);
      const narrowness = NARROWNESS[property]!;
      if (!current || rank > current.rank || (rank === current.rank && narrowness >= current.narrowness)) {
        best.set(longhand, { rank, narrowness, value: longhandValue });
      }
    }
  };
  const visit = (conditions: string[], style: Map<string, unknown>) => {
    for (const [key, value] of style) {
      if (value && typeof value === "object") visit([...conditions, canonical(key)], new Map(Object.entries(value)));
      else if (value !== null && value !== undefined) consider(conditions, key, value);
    }
  };
  visit([], merge(inputs));
  return Object.fromEntries(
    [...best].map(([longhand, { value }]) => [longhand, value]).sort(([a], [b]) => (a! < b! ? -1 : 1)),
  );
}
