// Seeded differential fuzzing in the spirit of shadcn-ui/cn packages/conformance/tests/fuzz.mjs:
// random `css()` calls must give the same classes and rules, in the same order, compiled as they do at runtime.
import { describe, expect, it } from "vite-plus/test";

import { renderPlan } from "../../src/unplugin/split/build.ts";
import { plan, type Graph } from "../../src/unplugin/split/plan.ts";
import { verify } from "../../src/unplugin/split/verify.ts";
import { planChunks, type ChunkNode, type GroupNode } from "../../src/unplugin/split/webpack.ts";
import { transform } from "../../src/unplugin/transform.ts";
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
    '" &:hover "',
    '":hover, :focus"',
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
  return { className, rules: Styles().props.rules.map(([, text]) => text) };
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
    const calls = code.split("\n").filter((line) => line.startsWith("  () => css("));
    expect(calls.some((line) => /css\(_kiln\$\d+\b/.test(line))).toBe(true);
    expect(calls.some((line) => /\{ .*: _kiln\$\d+\b/.test(line))).toBe(true);
    expect(calls.some((line) => !line.includes("_kiln$"))).toBe(true);
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

// Spread over ranks and nesting depths, so that sheets use layers others do not.
const textOf = (rule: string) => {
  const n = Number(rule.slice(1));
  return `@layer k${(n % 13).toString(36)}${".a".repeat(n % 3)}{.${rule}{order:${n}}}`;
};

describe("planned sheets load every rule once it is needed, and no earlier", () => {
  for (const mode of ["chunks", "single"] as const) {
    it(mode, () => {
      for (let seed = 1; seed <= GRAPHS; seed++) {
        const { graph, rulesOf } = randomGraph(seed * 0x9e3779b1);
        const sheets = renderPlan(plan(graph, rulesOf, mode), textOf);
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
        if (chunk.isDynamicEntry && chunk.dynamicImports.length > 0) nested++;
        if (chunk.imports.some((other) => graph.get(other)!.imports.includes(key))) cycles++;
      }
      const sheets = renderPlan(plan(graph, rulesOf, "chunks"), textOf);
      repeats += verify(graph, rulesOf, sheets, textOf).repeats;
    }
    expect(nested).toBeGreaterThan(0);
    expect(cycles).toBeGreaterThan(0);
    expect(repeats).toBeGreaterThan(0);
  });
});

const GROUP_GRAPHS = 2000;

// Seeded random chunk groups, as webpack and Rspack build them: chunks shared between groups, entrypoints that depend on
// others, and chunks without a stylesheet. Walking each load path as their runtime does, a whole group at once, every
// rule a loaded chunk needs must be in a loaded sheet, every sheet must go to a chunk with a stylesheet, and no sheet
// may hold a rule that every path had already loaded when it arrived.
function randomGroups(seed: number) {
  let state = seed >>> 0 || 1;
  const rnd = () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
  const pick = <T>(items: readonly T[]) => items[Math.floor(rnd() * items.length)]!;
  const rules = new Map<string, string[]>();
  const chunks = new Map<string, ChunkNode & { dynamicImports: string[] }>();
  for (let index = 0; index < 2 + Math.floor(rnd() * 8); index++) {
    const key = `c${index}`;
    const modules = Array.from({ length: Math.floor(rnd() * 3) }, (_, module) => `${key}/m${module}`);
    for (const module of modules) {
      rules.set(
        module,
        Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => `r${Math.floor(rnd() * 16)}`),
      );
    }
    // The CSS pipeline emits a stylesheet for every chunk with a CSS module, and some others have the app's own CSS.
    chunks.set(key, { name: key, modules, dynamicImports: [], stylesheet: modules.length > 0 || rnd() < 0.3 });
  }
  const keys = [...chunks.keys()];
  const groups = new Map<string, GroupNode>();
  const some = () => [...new Set(Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(keys)))];
  groups.set("main", { name: "main", chunks: [...new Set(["c0", ...some()])], initial: true, loadsWith: [] });
  // Other entrypoints, some loaded with main as Next.js loads a page with its layouts.
  for (let index = 0; index < Math.floor(rnd() * 3); index++) {
    const key = `page${index}`;
    groups.set(key, { name: key, chunks: some(), initial: true, loadsWith: rnd() < 0.6 ? ["main"] : [] });
  }
  for (let index = 0; index < 1 + Math.floor(rnd() * 5); index++) {
    // A group never holds the chunk that imports it, whose modules are there already.
    const importer = pick(pick([...groups.values()]).chunks);
    const members = some().filter((chunk) => chunk !== importer);
    if (members.length === 0) continue;
    const key = `g${index}`;
    groups.set(key, { name: key, chunks: members, initial: false, loadsWith: [] });
    chunks.get(importer)!.dynamicImports.push(key);
  }
  // A bundler only emits chunks that some group loads.
  for (const key of keys) {
    if (![...groups.values()].some((group) => group.chunks.includes(key))) chunks.delete(key);
  }
  return { chunks, groups, rulesOf: (module: string) => rules.get(module) ?? [] };
}

function walkGroups({ chunks, groups, rulesOf }: ReturnType<typeof randomGroups>, mode: "chunks" | "single") {
  // An entrypoint with no stylesheet has nowhere to put a single sheet, so the adapter plans such a build by chunks.
  let { sheets, unplaced, leading } = planChunks(chunks, groups, rulesOf, mode);
  if (unplaced.length > 0 && mode === "single") {
    ({ sheets, unplaced, leading } = planChunks(chunks, groups, rulesOf, "chunks"));
  }
  for (const key of sheets.keys()) if (!chunks.get(key)!.stylesheet) unplaced.push({ chunk: key });
  const missing: string[] = [];
  const overlapping: string[] = [];
  // A group's stylesheets arrive in no set order, so one that leaves out the layer statement needs a sheet that
  // declares it to have loaded with an earlier group.
  const undeclared: string[] = [];
  const needed = new Map<string, Set<string>>();
  const loadedWith = (key: string): string[] => [
    ...groups.get(key)!.chunks,
    ...groups.get(key)!.loadsWith.flatMap(loadedWith),
  ];
  // The chunks that are loaded whenever a chunk is.
  const alwaysWith = (chunk: string) =>
    [...groups]
      .filter(([, group]) => group.chunks.includes(chunk))
      .map(([key]) => new Set(loadedWith(key)))
      .reduce((all, set) => new Set([...all].filter((other) => set.has(other))));
  const visited = new Set<string>();
  const load = (loaded: ReadonlySet<string>, group: readonly string[], path: string) => {
    const now = new Set(loaded);
    const before = new Set([...loaded].flatMap((key) => sheets.get(key) ?? []));
    const fetched: string[] = [];
    for (const key of group) {
      if (now.has(key)) continue;
      now.add(key);
      fetched.push(key);
      for (const rule of sheets.get(key) ?? []) {
        if (!needed.has(key)) needed.set(key, new Set());
        if (!before.has(rule)) needed.get(key)!.add(rule);
      }
    }
    const declared = [...loaded].some((key) => leading.has(key) && sheets.get(key)?.length);
    for (const key of fetched) {
      if (sheets.get(key)?.length && !leading.has(key) && !declared) undeclared.push(`${path}: ${key}`);
    }
    for (const key of fetched) {
      for (const other of fetched) {
        if (other === key || !alwaysWith(key).has(other)) continue;
        for (const rule of sheets.get(key) ?? []) {
          if (sheets.get(other)?.includes(rule)) overlapping.push(`${path}: ${key} and ${other} hold ${rule}`);
        }
      }
    }
    const held = new Set([...now].flatMap((key) => sheets.get(key) ?? []));
    for (const key of now) {
      for (const module of chunks.get(key)!.modules) {
        for (const rule of rulesOf(module)) if (!held.has(rule)) missing.push(`${path}: ${key} needs ${rule}`);
      }
    }
    const state = [...now].sort().join();
    if (visited.has(state)) return;
    visited.add(state);
    for (const key of now) {
      for (const target of chunks.get(key)!.dynamicImports)
        load(now, groups.get(target)!.chunks, `${path} > ${target}`);
    }
  };
  for (const [key, group] of groups) if (group.initial) load(new Set(), loadedWith(key), key);
  const redundant = [...needed].flatMap(([key, rules]) =>
    sheets
      .get(key)!
      .filter((rule) => !rules.has(rule))
      .map((rule) => `${key} holds ${rule}`),
  );
  return {
    unplaced,
    missing: [...new Set(missing)],
    overlapping: [...new Set(overlapping)],
    undeclared: [...new Set(undeclared)],
    redundant,
  };
}

describe("sheets planned from webpack's chunk groups load every rule once it is needed, and no earlier", () => {
  for (const mode of ["chunks", "single"] as const) {
    it(mode, () => {
      for (let seed = 1; seed <= GROUP_GRAPHS; seed++) {
        const groups = randomGroups(seed * 0x9e3779b1);
        const { redundant, ...failures } = walkGroups(groups, mode);
        expect(failures, `seed ${seed}`).toEqual({ unplaced: [], missing: [], overlapping: [], undeclared: [] });
        if (mode === "chunks") expect(redundant, `seed ${seed}`).toEqual([]);
      }
    });
  }
});

describe("planChunks", () => {
  it("reports a shared chunk with rules but no stylesheet, rather than planning a sheet nothing holds", () => {
    const chunks = new Map<string, ChunkNode>([
      ["a", { name: "a", modules: [], dynamicImports: [], stylesheet: true }],
      ["b", { name: "b", modules: [], dynamicImports: [], stylesheet: true }],
      ["shared", { name: "shared", modules: ["shared/m"], dynamicImports: [], stylesheet: false }],
    ]);
    const groups = new Map<string, GroupNode>([
      ["a", { name: "a", chunks: ["a", "shared"], initial: true, loadsWith: [] }],
      ["b", { name: "b", chunks: ["b", "shared"], initial: true, loadsWith: [] }],
    ]);
    const { sheets, unplaced } = planChunks(chunks, groups, () => ["r"], "chunks");
    expect(unplaced).toEqual([{ chunk: "shared" }]);
    expect([...sheets.values()].flat()).not.toContain("r");
  });
});
