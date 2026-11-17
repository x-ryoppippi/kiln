import { describe, expect, it } from "vite-plus/test";

import {
  compiled,
  compileEntry,
  createTable,
  resolve,
  type CompileContext,
  type StyleInput,
} from "../../src/core/index.ts";
import { renderPlan } from "../../src/unplugin/split/build.ts";
import { plan, type Chunk, type Graph } from "../../src/unplugin/split/plan.ts";
import { computed, type ElementState } from "./cascade.ts";
import { expected, type Style } from "./spec.ts";
import { pick, random, randomCompound, randomState, randomStyle } from "./vocabulary.ts";

const GRAPHS = Number(process.env.NISHIKI_ORACLE_GRAPHS ?? 150);
const WALKS = 6;

interface App {
  graph: Graph;
  // Each chunk's one module styles one element, composing the styles of some modules it imports statically with its own.
  styles: Map<string, Style>;
  composed: Map<string, string[]>;
}

const chunk = (fields: Partial<Chunk> & { stableName: string }): Chunk => ({
  modules: [fields.stableName],
  imports: [],
  dynamicImports: [],
  isEntry: false,
  isDynamicEntry: false,
  ...fields,
});

function randomApp(seed: number): App {
  const rnd = random(seed);
  const size = 3 + Math.floor(rnd() * 6);
  const names = Array.from({ length: size }, (_, index) => "c" + index);
  const chunks = new Map<string, Chunk>(names.map((name) => [name, chunk({ stableName: name })]));
  const edit = (name: string, fields: Partial<Chunk>) => chunks.set(name, { ...chunks.get(name)!, ...fields });
  edit("c0", { isEntry: true });
  for (const name of names.slice(1)) {
    const roll = rnd();
    const importer = pick(rnd, names.slice(0, names.indexOf(name)));
    if (roll < 0.15) edit(name, { isEntry: true });
    else if (roll < 0.6) {
      edit(importer, { dynamicImports: [...chunks.get(importer)!.dynamicImports, name] });
      edit(name, { isDynamicEntry: true });
    } else {
      edit(importer, { imports: [...chunks.get(importer)!.imports, name] });
      // A shared chunk: other chunks may import it too, statically or dynamically.
      for (const other of names.slice(1, names.indexOf(name))) {
        if (other !== importer && rnd() < 0.3) edit(other, { imports: [...chunks.get(other)!.imports, name] });
      }
      if (rnd() < 0.2) {
        const from = pick(rnd, names.slice(0, names.indexOf(name)));
        edit(from, { dynamicImports: [...chunks.get(from)!.dynamicImports, name] });
        edit(name, { isDynamicEntry: true });
      }
    }
  }
  const compound = randomCompound(rnd);
  const styles = new Map(names.map((name) => [name, randomStyle(rnd, compound)]));
  const composed = new Map(
    names.map((name) => [
      name,
      [...closureOf(chunks, name)].filter((other) => other === name || rnd() < 0.5).reverse(),
    ]),
  );
  return { graph: chunks, styles, composed };
}

// A chunk and everything it imports statically, imports first, as their sheets are linked.
function closureOf(graph: Graph, key: string): Set<string> {
  const order = new Set<string>();
  const visit = (current: string) => {
    if (order.has(current)) return;
    order.add(current);
    for (const next of graph.get(current)!.imports) visit(next);
  };
  visit(key);
  return new Set([...order].reverse());
}

interface Compiled {
  rulesOf: (module: string) => string[];
  textOf: (rule: string) => string;
}

function compile(styles: Map<string, Style>, context?: CompileContext): Compiled {
  const text = new Map<string, string>();
  const rules = new Map<string, string[]>();
  for (const [module, style] of styles) {
    const own = Object.entries(style).flatMap(([key, value]) => compileEntry(key, value, context)[0]![2]);
    for (const [rule, ruleText] of own) text.set(rule, ruleText);
    rules.set(
      module,
      own.map(([rule]) => rule),
    );
  }
  return { rulesOf: (module) => rules.get(module) ?? [], textOf: (rule) => text.get(rule)! };
}

// The sheets a page holds after each step of a navigation: an entry with its static imports, then dynamic imports of
// loaded chunks, each bringing the sheets of the part of its closure not loaded yet, imports first.
function* navigations(graph: Graph, sheets: ReadonlyMap<string, string>, rnd: () => number) {
  const entries = [...graph].filter(([, chunk]) => chunk.isEntry).map(([key]) => key);
  for (let walk = 0; walk < WALKS; walk++) {
    const loaded = new Set<string>();
    const document: string[] = [];
    const load = (key: string) => {
      for (const next of closureOf(graph, key)) {
        if (loaded.has(next)) continue;
        loaded.add(next);
        const sheet = sheets.get(next);
        if (sheet) document.push(sheet);
      }
    };
    const path = [pick(rnd, entries)];
    load(path[0]!);
    yield { path, loaded, document };
    for (let step = 0; step < 4; step++) {
      const targets = [...loaded].flatMap((key) => graph.get(key)!.dynamicImports).filter((key) => !loaded.has(key));
      if (targets.length === 0) break;
      const target = pick(rnd, targets);
      path.push(target);
      load(target);
      yield { path, loaded, document };
    }
  }
}

describe("planned sheets compute the same values on every navigation path", () => {
  it("for random apps over the ranked vocabulary", () => {
    const failures: unknown[] = [];
    for (let seed = 1; seed <= GRAPHS; seed++) {
      const app = randomApp(seed * 0x9e3779b1);
      const { rulesOf, textOf } = compile(app.styles);
      const sheets = renderPlan(plan(app.graph, rulesOf, "chunks"), textOf);
      const rnd = random(seed);
      for (const { path, loaded, document } of navigations(app.graph, sheets, rnd)) {
        for (const key of loaded) {
          const styles = app.composed.get(key)!.map((module) => app.styles.get(module)!);
          const inputs: StyleInput[] = styles;
          const classes = new Set(resolve(inputs)[0].split(" ").filter(Boolean));
          const state = randomState(rnd, classes);
          const actual = computed(document, state);
          const want = expected(styles, state);
          if (JSON.stringify(actual) !== JSON.stringify(want))
            failures.push({ seed, path: path.join(" > "), key, actual, want });
        }
      }
    }
    expect(failures.slice(0, 3)).toEqual([]);
  });
});

describe("a card whose 600px rule loads before a route adds a 900px rule", () => {
  // `card` styles a card at 600px; route `a` composes it with a 900px override; route `b` renders the card alone.
  const card: Style = { padding: 0, "@media (min-width: 600px)": { padding: 8 } };
  const a: Style = { "@media (min-width: 900px)": { padding: 16 } };
  const graph: Graph = new Map([
    ["main", chunk({ stableName: "main", isEntry: true, dynamicImports: ["a", "b"] })],
    ["a", chunk({ stableName: "a", isDynamicEntry: true, imports: ["card"] })],
    ["b", chunk({ stableName: "b", isDynamicEntry: true, imports: ["card"] })],
    ["card", chunk({ stableName: "card" })],
  ]);
  const styles = new Map<string, Style>([
    ["main", { margin: 0 }],
    ["a", a],
    ["b", { color: "red" }],
    ["card", card],
  ]);
  const ranked = { table: createTable({ breakpoints: ["600px", "900px"] }) };
  const { rulesOf, textOf } = compile(styles, ranked);
  const sheets = renderPlan(plan(graph, rulesOf, "chunks"), textOf);
  const precompile = (style: Style) =>
    compiled(Object.entries(style).flatMap(([key, value]) => compileEntry(key, value, ranked)));
  const cardInA = new Set(resolve([precompile(card), precompile(a)])[0].split(" "));
  const paddingOf = (path: string[], width: number) => {
    const loaded = new Set<string>();
    const document: string[] = [];
    for (const key of path) {
      for (const next of closureOf(graph, key)) {
        if (loaded.has(next)) continue;
        loaded.add(next);
        if (sheets.has(next)) document.push(sheets.get(next)!);
      }
    }
    const state: ElementState = { classes: cardInA, width };
    return computed(document, state)["padding-top"];
  };

  it.each([[["main", "a"]], [["main", "a", "b"]], [["main", "b", "a"]], [["main", "a", "b", "a"]]])(
    "shows 16px at 900px and up in route a after %j, while a stays mounted too",
    (path) => {
      expect(paddingOf(path, 1000)).toBe("16px");
      expect(paddingOf(path, 700)).toBe("8px");
      expect(paddingOf(path, 500)).toBe("0px");
    },
  );
});
