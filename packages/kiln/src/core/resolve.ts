import { compileEntry, type Entry, type Rule } from "./compile.ts";

const COMPILED = "$$kiln";

/** Styles pre-compiled by the build plugin, optionally with a part left for runtime. */
export interface Compiled {
  readonly [COMPILED]: readonly Entry[];
  readonly d?: Record<string, unknown>;
}

/** Create compiled styles. Emitted by the build plugin; not meant to be written by hand. */
export function compiled(entries: readonly Entry[], dynamic?: Record<string, unknown>): Compiled {
  return dynamic ? { [COMPILED]: entries, d: dynamic } : Object.freeze({ [COMPILED]: entries });
}

/** A style object, compiled styles, nullish, or a list of them merged in order. */
export type StyleInput = object | null | undefined | false;

function isCompiled(input: object): input is Compiled {
  return COMPILED in input;
}

function addRaw(entries: Map<string, Entry>, styles: Record<string, unknown>): void {
  for (const key in styles) {
    entries.set(key, compileEntry(key, styles[key]));
  }
}

function add(entries: Map<string, Entry>, inputs: readonly StyleInput[]): void {
  for (const input of inputs) {
    if (!input) continue;
    if (Array.isArray(input)) {
      add(entries, input);
    } else if (isCompiled(input)) {
      if (input.d) addRaw(entries, input.d);
      for (const entry of input[COMPILED]) entries.set(entry[0], entry);
    } else {
      addRaw(entries, input as Record<string, unknown>);
    }
  }
}

export type Resolved = readonly [className: string, rules: readonly Rule[]];

interface CacheNode {
  result?: Resolved;
  next?: WeakMap<object, CacheNode>;
}

const cache = new WeakMap<object, CacheNode>();

/**
 * Find the cache slot for a sequence of inputs, or undefined when any input could change between calls.
 * Only compiled styles without a runtime part qualify: they are frozen, and the build plugin hoists them
 * to module scope, so the same render passes the same objects every time.
 */
function slotFor(
  inputs: readonly StyleInput[],
  node: CacheNode | undefined,
  map: WeakMap<object, CacheNode>,
): CacheNode | undefined | false {
  for (const input of inputs) {
    if (!input) continue;
    if (Array.isArray(input)) {
      const nested = slotFor(input, node, map);
      if (nested === false) return false;
      if (nested) {
        node = nested;
        map = nested.next ??= new WeakMap();
      }
      continue;
    }
    if (!isCompiled(input) || input.d) return false;
    let next = map.get(input);
    if (!next) map.set(input, (next = {}));
    node = next;
    map = next.next ??= new WeakMap();
  }
  return node;
}

function compute(inputs: readonly StyleInput[]): Resolved {
  const entries = new Map<string, Entry>();
  add(entries, inputs);

  let className = "";
  const rules: Rule[] = [];
  const seen = new Set<string>();
  for (const [, entryClassName, entryRules] of entries.values()) {
    if (entryClassName) className = className ? className + " " + entryClassName : entryClassName;
    for (const rule of entryRules) {
      if (seen.has(rule[0])) continue;
      seen.add(rule[0]);
      rules.push(rule);
    }
  }
  return [className, rules];
}

/**
 * Merge style inputs per top-level key, later inputs winning, and return the
 * class names with the rules that still need to be inserted at runtime.
 */
export function resolve(inputs: readonly StyleInput[]): Resolved {
  const slot = slotFor(inputs, undefined, cache);
  if (!slot) return compute(inputs);
  return (slot.result ??= compute(inputs));
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;

  describe("resolve", () => {
    const classOf = (input: Parameters<typeof resolve>[0]) => new Set(resolve(input)[0].split(" "));

    it("merges per top-level key with later inputs winning", () => {
      expect(classOf([{ color: "red" }, { color: "blue" }])).toEqual(classOf([{ color: "blue" }]));
    });

    it("lets null unset an earlier key", () => {
      expect(classOf([{ color: "red", margin: 0 }, { color: null }])).toEqual(classOf([{ margin: 0 }]));
    });

    it("applies compiled entries over their dynamic part", () => {
      const input = compiled([compileEntry("color", "red")], { color: "blue", margin: 0 });
      expect(classOf([input])).toEqual(classOf([{ margin: 0, color: "red" }]));
    });

    it("dedupes rules shared between keys", () => {
      const [, rules] = resolve([{ ":hover": { color: "red" } }, { "&:hover": { color: "red" } }]);
      expect(rules).toHaveLength(1);
    });

    it("flattens nested lists in order", () => {
      expect(classOf([[{ color: "red" }, [{ color: "blue", margin: 0 }]], { margin: 1 }])).toEqual(
        classOf([{ color: "blue", margin: 1 }]),
      );
    });
  });

  describe("cache", () => {
    it("returns the same result for the same compiled inputs", () => {
      const a = compiled([compileEntry("color", "red")]);
      const b = compiled([compileEntry("margin", 0)]);
      expect(resolve([a, b])).toBe(resolve([a, undefined, [b]]));
      expect(resolve([a, b])).not.toBe(resolve([b, a]));
    });

    it("does not cache inputs that can change", () => {
      const styles = { color: "red" };
      const first = resolve([styles]);
      styles.color = "blue";
      expect(resolve([styles])).not.toEqual(first);
      const partial = compiled([compileEntry("color", "red")], { margin: 0 });
      expect(resolve([partial])).not.toBe(resolve([partial]));
    });
  });
}
