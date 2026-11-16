// Random styles over the ranked vocabulary, and states to evaluate them in.
import type { ElementState } from "./cascade.ts";
import { NARROWNESS, RANKED, type Style } from "./spec.ts";

export function random(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

export const pick = <T>(rnd: () => number, items: readonly T[]): T => items[Math.floor(rnd() * items.length)]!;

const PROPERTIES = Object.keys(NARROWNESS);
const VALUES = [0, 1, 2, 4, 8, 16];
const MEDIA = RANKED.filter((condition) => condition.startsWith("@"));
const PSEUDO = RANKED.filter((condition) => condition.startsWith(":"));

function declarations(rnd: () => number): Style {
  const style: Style = {};
  for (let count = 1 + Math.floor(rnd() * 3); count > 0; count--) {
    const property = pick(rnd, PROPERTIES);
    // `false` and `true` compile to nothing, and `false` unsets a key an earlier input set.
    style[property] =
      rnd() < 0.08 ? rnd() < 0.5 : property === "color" ? pick(rnd, ["red", "blue", "green"]) : pick(rnd, VALUES);
  }
  return style;
}

// A pseudo-class as `:hover` or as `&:hover`, which kiln merges as the same key.
const written = (rnd: () => number, condition: string) =>
  condition.startsWith(":") && rnd() < 0.3 ? "&" + condition : condition;

/** The media query a composition nests pseudo-classes in. */
export const randomCompound = (rnd: () => number): string => pick(rnd, MEDIA);

/**
 * A style object: properties and ranked conditions, and pseudo-classes nested in `compound`. Every path of two
 * conditions in a composition nests a pseudo-class in that one media query, so no two paths share their highest
 * condition and tie, which kiln documents as unsolved.
 */
export function randomStyle(rnd: () => number, compound: string): Style {
  const style: Style = {};
  for (let count = 1 + Math.floor(rnd() * 4); count > 0; count--) {
    const roll = rnd();
    if (roll < 0.35) Object.assign(style, declarations(rnd));
    else if (roll < 0.85) style[written(rnd, pick(rnd, RANKED))] = declarations(rnd);
    else {
      style[compound] = {
        ...(style[compound] as Style | undefined),
        [written(rnd, pick(rnd, PSEUDO))]: declarations(rnd),
      };
    }
  }
  return style;
}

/** States that tell every ranked condition apart: widths around each breakpoint, and each flag on and off. */
export function randomState(rnd: () => number, classes: ReadonlySet<string>): ElementState {
  const flags = (names: string[]) => new Set(names.filter(() => rnd() < 0.4));
  return {
    classes,
    width: pick(rnd, [320, 639, 640, 700, 768, 900, 1024, 1440]),
    pseudo: flags(["hover", "focus", "active", "disabled"]),
    attributes: Object.fromEntries(
      ["aria-expanded", "aria-selected"].filter(() => rnd() < 0.4).map((name) => [name, "true"]),
    ),
    media: flags(["prefers-color-scheme: dark"]),
  };
}

/**
 * Rules in an order a page may hold them in: shuffled, with copies of some placed again later, as a sheet fetched again
 * or a rule React inserts before another page's would.
 */
export function shuffled<T>(rnd: () => number, items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(rnd() * (index + 1));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  for (let copies = Math.floor(rnd() * 4); copies > 0 && result.length > 0; copies--) {
    const from = Math.floor(rnd() * result.length);
    const at = from + 1 + Math.floor(rnd() * (result.length - from));
    result.splice(at, 0, result[from]!);
  }
  return result;
}
