// Seeded differential fuzzing in the spirit of shadcn-ui/cn packages/conformance/tests/fuzz.mjs:
// random `css()` calls must give the same classes and rules compiled as they do at runtime.
import { describe, expect, it } from "vite-plus/test";

import { plan, type Graph } from "../src/split/plan.ts";
import { renderSheet } from "../src/split/sheet.ts";
import { verify } from "../src/split/verify.ts";
import { transform } from "../src/transform.ts";
import { evaluate } from "./helpers/evaluate.ts";

const SEEDS = 20;
const CASES_PER_SEED = 40;

function generator(seed: number) {
  let state = seed >>> 0 || 1;
  const rnd = () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
  const chance = (p: number) => rnd() < p;
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rnd() * items.length)]!;

  const properties = ["color", "margin", "padding", "marginTop", "lineHeight", "opacity", "--gap", "aspectRatio"];
  const selectors = [
    '":hover"',
    '"&:focus"',
    '".parent &"',
    '"&:hover, span"',
    '"@media (min-width: 1px)"',
    '"@supports (display: grid)"',
    '"::before"',
  ];
  const literalValues = ['"red"', "`blue`", "0", "8", "-4", "1.5", "null", "undefined", '"1rem"', '"calc(1px + 2%)"'];
  const dynamicValues = ["tone", "size", "size * 2", "maybe", 'flag ? "green" : null', "`${size}px`", "false"];
  const quotedKeys = ['"color"', "'margin'", '"--a-b"', "1", "0x10"];
  const computedKeys = ["[k]", '["color"]', "[`pad${'ding'}`]", "[flag ? 'color' : 'margin']"];
  const spreads = ["...dyn", "...(flag ? { margin: 1 } : {})", "...null", "...{ color: tone }"];

  const value = (depth: number): string => {
    if (depth < 2 && chance(0.2)) return object(depth + 1);
    return chance(0.7) ? pick(literalValues) : pick(dynamicValues);
  };

  function object(depth: number): string {
    const parts: string[] = [];
    const length = Math.floor(rnd() * 6);
    for (let index = 0; index < length; index++) {
      const roll = rnd();
      if (roll < 0.08) parts.push(pick(spreads));
      else if (roll < 0.16) parts.push(`${pick(computedKeys)}: ${value(depth)}`);
      else if (roll < 0.24) parts.push(`${pick(quotedKeys)}: ${value(depth)}`);
      else if (roll < 0.27)
        parts.push(`get ${pick(properties.filter((name) => !name.startsWith("-")))}() { return tone }`);
      else if (roll < 0.42 && depth < 3) parts.push(`${pick(selectors)}: ${object(depth + 1)}`);
      else parts.push(`${JSON.stringify(pick(properties))}: ${value(depth)}`);
    }
    return `{ ${parts.join(", ")} }`;
  }

  const argument = () => (chance(0.1) ? pick(["null", "false", "undefined"]) : object(0));
  const call = () => `css(${Array.from({ length: 1 + Math.floor(rnd() * 3) }, argument).join(", ")})`;

  return { call };
}

function moduleFor(seed: number): string {
  const { call } = generator(seed);
  const cases = Array.from({ length: CASES_PER_SEED }, () => `  () => ${call()},`);
  return [
    `import { css } from "kiln";`,
    `const tone = "teal", size = 3, maybe = null, flag = true, k = "padding", dyn = { color: "blue", margin: 2 };`,
    `export const cases = [`,
    ...cases,
    `];`,
  ].join("\n");
}

type Case = () => [string, () => { props: { rules: readonly (readonly [string, string])[] } }];

const outcome = (fn: Case) => {
  const [className, Styles] = fn();
  return {
    classes: [...new Set(className.split(" ").filter(Boolean))].sort(),
    rules: [...new Set(Styles().props.rules.map(([, text]) => text))].sort(),
  };
};

describe("compiled css() calls behave like runtime ones", () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    it(`seed ${seed}`, () => {
      const source = moduleFor(seed * 0x9e3779b1);
      const result = transform(source, `fuzz-${seed}.js`);
      expect(result, "the generator should always produce something to compile").not.toBeNull();

      const original: Case[] = evaluate(source).cases;
      const compiled: Case[] = evaluate(result!.code).cases;
      original.forEach((fn, index) => {
        expect(outcome(compiled[index]!), source.split("\n")[index + 3]).toEqual(outcome(fn));
      });
    });
  }

  it("covers compiled, partly compiled and runtime-only calls", () => {
    const code = Array.from(
      { length: SEEDS },
      (_, index) => transform(moduleFor((index + 1) * 0x9e3779b1), "a.js")!.code,
    ).join("\n");
    expect(code).toMatch(/css\(_kiln\$\d+\b/);
    expect(code).toMatch(/_kiln\$\(\[.*\],\{/);
    expect(code).toMatch(/css\(\{ /);
  });
});

// Seeded random chunk graphs: every plan must load each rule a chunk needs on every load path, start every sheet
// with the layer order, hold no rule that every path to its sheet had already loaded, and never fetch one rule in two
// sheets of which one always loads with the other.
const GRAPHS = 300;

function randomGraph(seed: number) {
  let state = seed >>> 0 || 1;
  const rnd = () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
  const count = 2 + Math.floor(rnd() * 9);
  const keys = Array.from({ length: count }, (_, index) => `c${index}`);
  const entries = new Set(["c0", ...(rnd() < 0.25 ? ["c1"] : [])]);
  const lazy = new Set(keys.filter((key) => !entries.has(key) && rnd() < 0.6));
  const rules = new Map<string, string[]>();
  const graph = new Map(
    keys.map((key, index) => {
      const modules = Array.from({ length: 1 + Math.floor(rnd() * 2) }, (_, module) => `${key}/m${module}`);
      for (const module of modules) {
        rules.set(
          module,
          Array.from({ length: Math.floor(rnd() * 6) }, () => `r${Math.floor(rnd() * 16)}`),
        );
      }
      // Mostly forward edges, as bundlers emit, with the odd back edge for a static cycle or a lazy chunk importing
      // the entry chunk.
      const imports = keys.filter((other, at) => other !== key && rnd() < (at > index ? 0.25 : 0.05));
      const dynamicImports = [...lazy].filter((other) => other !== key && rnd() < 0.3);
      return [
        key,
        { modules, imports, dynamicImports, isEntry: entries.has(key), isDynamicEntry: lazy.has(key), stableName: key },
      ];
    }),
  );
  // A bundler only emits chunks that an entry reaches.
  for (const key of keys) {
    const reached = new Set(entries);
    for (const current of reached) {
      for (const next of [...graph.get(current)!.imports, ...graph.get(current)!.dynamicImports]) reached.add(next);
    }
    if (!reached.has(key)) (lazy.has(key) ? graph.get("c0")!.dynamicImports : graph.get("c0")!.imports).push(key);
  }
  return { graph: graph satisfies Graph, rulesOf: (module: string) => rules.get(module) ?? [] };
}

const textOf = (rule: string) => `@layer k${Number(rule.slice(1)) % 12}{.${rule}{order:${rule.slice(1)}}}`;

describe("planned sheets load every rule once it is needed, and no earlier", () => {
  for (const mode of ["chunks", "single"] as const) {
    it(mode, () => {
      for (let seed = 1; seed <= GRAPHS; seed++) {
        const { graph, rulesOf } = randomGraph(seed * 0x9e3779b1);
        const sheets = new Map(
          [...plan(graph, rulesOf, mode)].map(([key, classes]) => [key, renderSheet(classes, textOf)]),
        );
        const verdict = verify(graph, rulesOf, sheets, textOf);
        const { repeats: _, ...failures } = verdict;
        expect(failures, `seed ${seed}`).toEqual({ missing: [], redundant: [], unordered: [], overlapping: [] });
      }
    });
  }

  it("generates graphs with nested lazy units, static cycles and repeats along a path", () => {
    let nested = 0;
    let cycles = 0;
    let repeats = 0;
    for (let seed = 1; seed <= GRAPHS; seed++) {
      const { graph, rulesOf } = randomGraph(seed * 0x9e3779b1);
      for (const [key, chunk] of graph) {
        if (!chunk.isEntry && chunk.dynamicImports.length > 0) nested++;
        if (chunk.imports.some((other) => graph.get(other)!.imports.includes(key))) cycles++;
      }
      const sheets = new Map(
        [...plan(graph, rulesOf, "chunks")].map(([key, classes]) => [key, renderSheet(classes, textOf)]),
      );
      repeats += verify(graph, rulesOf, sheets, textOf).repeats;
    }
    expect(nested).toBeGreaterThan(0);
    expect(cycles).toBeGreaterThan(0);
    expect(repeats).toBeGreaterThan(0);
  });
});
