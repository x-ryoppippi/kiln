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

  // Compiled styles whose class names are given directly, the way StyleX tests pass pre-compiled objects.
  const precompiled = (classNames: Record<string, string>) =>
    compiled(Object.entries(classNames).map(([key, className]): Entry => [key, className, []]));
  const classNameOf = (inputs: readonly StyleInput[]) => resolve(inputs)[0];
  const sorted = (className: string) => className.split(" ").sort();

  describe("merging compiled styles", () => {
    // Ported from facebook/stylex packages/@stylexjs/stylex/__tests__/stylex-test.js (`props`)
    it("joins the class names of one input", () => {
      expect(classNameOf([precompiled({ a: "aaa", b: "bbb" })])).toBe("aaa bbb");
    });

    it("keeps first-seen key order across inputs", () => {
      expect(
        classNameOf([
          [
            precompiled({ a: "a", ":hover__aa": "aa" }),
            precompiled({ b: "b" }),
            precompiled({ c: "c", ":hover__cc": "cc" }),
          ],
        ]),
      ).toBe("a aa b c cc");
    });

    it("lets a later input override a key", () => {
      expect(
        classNameOf([precompiled({ backgroundColor: "nu7423ey" }), precompiled({ backgroundColor: "gh25dzvf" })]),
      ).toBe("gh25dzvf");
    });

    it("overrides keys through nested arrays", () => {
      // StyleX moves an overridden key to its new position; kiln keeps where it was first seen,
      // which cannot matter because rules are ordered by layer, not by class order.
      const className = classNameOf([
        precompiled({ backgroundColor: "nu7423ey" }),
        [precompiled({ backgroundColor: "abcdefg", ":hover__backgroundColor": "ksdfmwjs" })],
        precompiled({ color: "gofk2cf1", ":hover__backgroundColor": "rse6dlih" }),
      ]);
      expect(sorted(className)).toEqual(sorted("abcdefg gofk2cf1 rse6dlih"));
    });

    it("merges inputs with only pseudo-class keys", () => {
      expect(
        classNameOf([
          precompiled({ ":hover__backgroundColor": "rse6dlih" }),
          precompiled({ ":hover__color": "gofk2cf1" }),
        ]),
      ).toBe("rse6dlih gofk2cf1");
    });

    it("resolves a deeply nested list with falsy entries, and caches the result", () => {
      const styles: StyleInput[] = [
        precompiled({
          backgroundColor: "nu7423ey",
          borderColor: "tpe1esc0",
          borderStyle: "gewhe1h2",
          borderWidth: "gcovof34",
          boxSizing: "bdao358l",
          display: "rse6dlih",
          listStyle: "s5oniofx",
          marginTop: "m8h3af8h",
          marginEnd: "l7ghb35v",
          marginBottom: "kjdc1dyq",
          marginStart: "kmwttqpk",
          paddingTop: "srn514ro",
          paddingEnd: "oxkhqvkx",
          paddingBottom: "rl78xhln",
          paddingStart: "nch0832m",
          WebkitTapHighlightColor: "qi72231t",
          textAlign: "cr00lzj9",
          textDecoration: "rn8ck1ys",
          whiteSpace: "n3t5jt4f",
          wordWrap: "gh25dzvf",
          zIndex: "g4tp4svg",
        }),
        false,
        false,
        false,
        false,
        [
          precompiled({ cursor: "fsf7x5fv", touchAction: "s3jn8y49" }),
          false,
          precompiled({ outline: "icdlwmnq" }),
          [
            precompiled({ WebkitTapHighlightColor: "oajrlxb2", cursor: "nhd2j8a9", touchAction: "f1sip0of" }),
            false,
            false,
            precompiled({ textDecoration: "esuyzwwr", ":hover__textDecoration": "p8dawk7l" }),
            false,
            [
              precompiled({
                backgroundColor: "g5ia77u1",
                border: "e4t7hp5w",
                color: "gmql0nx0",
                cursor: "nhd2j8a9",
                display: "q9uorilb",
                fontFamily: "ihxqhq3m",
                fontSize: "l94mrbxd",
                lineHeight: "aenfhxwr",
                marginTop: "kvgmc6g5",
                marginEnd: "cxmmr5t8",
                marginBottom: "oygrvhab",
                marginStart: "hcukyx3x",
                paddingTop: "jb3vyjys",
                paddingEnd: "rz4wbd8a",
                paddingBottom: "qt6c0cv9",
                paddingStart: "a8nywdso",
                textAlign: "i1ao9s8h",
                textDecoration: "myohyog2",
                ":hover__color": "ksdfmwjs",
                ":hover__textDecoration": "gofk2cf1",
                ":active__transform": "lsqurvkf",
                ":active__transition": "bj9fd4vl",
              }),
              precompiled({ display: "a8c37x1j", width: "k4urcfbm" }),
              [precompiled({ ":active__transform": "tm8avpzi" })],
            ],
          ],
        ],
      ];

      const value = resolve(styles);
      expect(resolve(styles)).toBe(value);
      expect(sorted(value[0])).toEqual(
        sorted(
          "g5ia77u1 tpe1esc0 gewhe1h2 gcovof34 bdao358l a8c37x1j s5oniofx kvgmc6g5 cxmmr5t8 oygrvhab hcukyx3x jb3vyjys rz4wbd8a qt6c0cv9 a8nywdso oajrlxb2 i1ao9s8h myohyog2 n3t5jt4f gh25dzvf g4tp4svg nhd2j8a9 f1sip0of icdlwmnq e4t7hp5w gmql0nx0 ihxqhq3m l94mrbxd aenfhxwr k4urcfbm gofk2cf1 ksdfmwjs tm8avpzi bj9fd4vl",
        ),
      );
    });

    // Ported from facebook/stylex packages/@stylexjs/babel-plugin/__tests__/transform-stylex-props-test.js
    it("resolves no inputs to nothing", () => {
      expect(resolve([])).toEqual(["", []]);
    });
  });

  describe("merging style objects", () => {
    it("merges nested selectors as a whole per top-level key", () => {
      // StyleX merges `:hover` per property; in kiln a later `:hover` object replaces the earlier one.
      expect(sorted(classNameOf([{ ":hover": { color: "red", margin: 0 } }, { ":hover": { color: "blue" } }]))).toEqual(
        sorted(classNameOf([{ ":hover": { color: "blue" } }])),
      );
    });

    it("lets undefined and false unset an earlier key like null", () => {
      expect(classNameOf([{ color: "red", margin: 0 }, { color: undefined }])).toBe(classNameOf([{ margin: 0 }]));
      expect(classNameOf([{ color: "red", margin: 0 }, { color: false }])).toBe(classNameOf([{ margin: 0 }]));
    });

    // Ported from shadcn-ui/cn packages/conformance/tests/correctness.mjs (cn join semantics)
    it("skips falsy inputs and flattens arrays", () => {
      const falsy = [false, null, undefined, 0, ""] as unknown as StyleInput[];
      expect(classNameOf([{ padding: 2 }, ...falsy, { paddingInline: 3 }])).toBe(
        classNameOf([{ padding: 2, paddingInline: 3 }]),
      );
      expect(classNameOf([[{ padding: 2 }, [{ paddingInline: 3 }, { paddingBlock: 1, display: false }]]])).toBe(
        classNameOf([{ padding: 2, paddingInline: 3, paddingBlock: 1 }]),
      );
      expect(classNameOf([{ padding: 2 }, { padding: 4 }])).toBe(classNameOf([{ padding: 4 }]));
      expect(resolve([[]])).toEqual(["", []]);
      expect(resolve([[], [[]], false])).toEqual(["", []]);
    });
  });

  // Adapted from the idempotence and cached-vs-uncached checks in
  // shadcn-ui/cn packages/conformance/tests/correctness.mjs
  describe("differential", () => {
    const random = (seed: number) => () => {
      seed ^= seed << 13;
      seed >>>= 0;
      seed ^= seed >> 17;
      seed ^= seed << 5;
      seed >>>= 0;
      return seed / 0x100000000;
    };
    const rnd = random(0x5eed1234);
    const pick = <T>(items: readonly T[]): T => items[Math.floor(rnd() * items.length)]!;

    const keys = ["color", "margin", "padding", "marginTop", "lineHeight", "--x", ":hover", "@media print", "& span"];
    const leaf = () => pick<unknown>(["red", "blue", 0, 4, -2, 1.5, "1rem", null, undefined, false]);
    const value = (key: string): unknown =>
      key.startsWith(":") || key.startsWith("@") || key.includes("&")
        ? Object.fromEntries(Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => [pick(keys.slice(0, 6)), leaf()]))
        : leaf();
    const styleObject = () =>
      Object.fromEntries(
        Array.from({ length: Math.floor(rnd() * 5) }, () => {
          const key = pick(keys);
          return [key, value(key)];
        }),
      );

    // A random input together with the plain style object it stands for.
    type Case = { input: StyleInput; raw: StyleInput };
    const randomCase = (depth = 0): Case => {
      const roll = rnd();
      if (roll < 0.1) {
        const falsy = pick([null, undefined, false] as const);
        return { input: falsy, raw: falsy };
      }
      if (roll < 0.25 && depth < 2) {
        const items = Array.from({ length: Math.floor(rnd() * 4) }, () => randomCase(depth + 1));
        return { input: items.map((item) => item.input), raw: items.map((item) => item.raw) };
      }
      const raw = styleObject();
      if (roll < 0.45) return { input: raw, raw };
      const entries = Object.entries(raw).map(([key, item]) => compileEntry(key, item));
      if (roll < 0.75) return { input: compiled(entries), raw };
      const dynamic = styleObject();
      return { input: compiled(entries, dynamic), raw: { ...dynamic, ...raw } };
    };
    const cases = Array.from({ length: 500 }, () =>
      Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => randomCase()),
    );

    // Fresh copies are new objects, so `resolve` cannot have a cached result for them.
    const fresh = (input: StyleInput): StyleInput =>
      Array.isArray(input) ? input.map(fresh) : input && typeof input === "object" ? { ...input } : input;

    it("resolves compiled inputs the same as the style objects they came from", () => {
      for (const items of cases) {
        expect(resolve(items.map((item) => item.input))).toEqual(resolve(items.map((item) => item.raw)));
      }
    });

    it("returns the same result cached and uncached", () => {
      for (const items of cases) {
        const inputs = items.map((item) => item.input);
        const cached = resolve(inputs);
        expect(resolve(inputs)).toEqual(cached);
        expect(resolve(inputs.map(fresh))).toEqual(cached);
      }
    });

    it("is idempotent and associative", () => {
      for (const items of cases) {
        const inputs = items.map((item) => item.input);
        const once = resolve(inputs);
        expect(resolve([inputs, inputs])).toEqual(once);
        expect(resolve([inputs.slice(0, 1), inputs.slice(1)])).toEqual(once);
        expect(resolve([...inputs.slice(0, -1), [inputs.at(-1)]])).toEqual(once);
      }
    });
  });
}
