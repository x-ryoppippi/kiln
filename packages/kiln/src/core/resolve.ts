import { compileEntry, type Entry, type Rule } from "./compile.ts";

const COMPILED = "$$kiln";

/** Styles pre-compiled by the build plugin, optionally with a part left for runtime. */
export interface Compiled {
  readonly [COMPILED]: readonly Entry[];
  readonly d?: Record<string, unknown>;
}

/** Create compiled styles. Emitted by the build plugin; not meant to be written by hand. */
export function compiled(entries: readonly Entry[], dynamic?: Record<string, unknown>): Compiled {
  return dynamic ? { [COMPILED]: entries, d: dynamic } : { [COMPILED]: entries };
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

/**
 * Merge style inputs per top-level key, later inputs winning, and return the
 * class names with the rules that still need to be inserted at runtime.
 */
export function resolve(inputs: readonly StyleInput[]): [className: string, rules: Rule[]] {
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
}
