// Plans which kiln rules each stylesheet holds from an output chunk graph, without knowing the bundler.
// A unit is a chunk the browser can load on its own: an entry or a dynamic import. Loading it loads its static
// closure, with the sheet of every chunk in it that is not loaded yet.

export interface Chunk {
  // Modules whose code is in the chunk, in the bundler's order; leave out ones the bundler rendered empty.
  modules: readonly string[];
  imports: readonly string[];
  dynamicImports: readonly string[];
  isEntry: boolean;
  isDynamicEntry: boolean;
  // Names the chunk the same way in every build, unlike a preliminary file name with a hash placeholder.
  stableName: string;
}

export type Graph = ReadonlyMap<string, Chunk>;
export type Mode = "chunks" | "single";

// The rule classes of each chunk that gets a sheet, by chunk key, in cascade order.
export type Plan = Map<string, string[]>;

export function plan(graph: Graph, rulesOf: (module: string) => readonly string[], mode: Mode): Plan {
  const chunk = (key: string) => graph.get(key)!;
  const order = (a: string, b: string) => {
    const [x, y] = [chunk(a).stableName, chunk(b).stableName];
    return x < y ? -1 : x > y ? 1 : 0;
  };
  const keys = [...graph.keys()].sort(order);
  const edges = (key: string, of: (chunk: Chunk) => readonly string[]) =>
    of(chunk(key)).filter((next) => graph.has(next));
  const reach = (key: string, of: (chunk: Chunk) => readonly string[]) => {
    const seen = new Set([key]);
    for (const current of seen) for (const next of edges(current, of)) seen.add(next);
    return seen;
  };
  const closures = new Map(keys.map((key) => [key, reach(key, (c) => c.imports)]));
  const chunkRules = new Map(keys.map((key) => [key, chunk(key).modules.flatMap((id) => rulesOf(id))]));
  const rulesIn = (chunks: Iterable<string>) => {
    const rules = new Set<string>();
    for (const key of chunks) for (const rule of chunkRules.get(key)!) rules.add(rule);
    return rules;
  };

  // Rules in one layer with equal specificity, such as two overlapping media queries, win by their order in the
  // sheet, so every sheet keeps the order in which each rule first runs: an entry's static imports before its own
  // modules, then the units it imports dynamically. That is the order the dev server and the runtime insert them in.
  const rank = new Map<string, number>();
  const ranked = new Set<string>();
  const queue = keys.filter((key) => chunk(key).isEntry);
  const visit = (key: string) => {
    if (ranked.has(key)) return;
    ranked.add(key);
    for (const next of edges(key, (c) => c.imports)) visit(next);
    for (const rule of chunkRules.get(key)!) if (!rank.has(rule)) rank.set(rule, rank.size);
    queue.push(...edges(key, (c) => c.dynamicImports));
  };
  for (const key of queue) visit(key);
  for (const key of keys) visit(key);

  const units = keys.filter((key) => chunk(key).isEntry || chunk(key).isDynamicEntry);
  const needed = new Map<string, Set<string>>();
  // What is certainly loaded whenever a unit arrives through a dynamic import; null while that may be anything.
  const inherited = new Map<string, Set<string> | null>();

  if (mode === "single") {
    for (const key of units) {
      if (!chunk(key).isEntry) continue;
      needed.set(key, rulesIn(reach(key, (c) => [...c.imports, ...c.dynamicImports])));
      inherited.set(key, new Set());
    }
  } else {
    // The units whose closure imports each unit dynamically.
    const contexts = new Map(units.map((key) => [key, new Set<string>()]));
    const targets = new Map(units.map((key) => [key, new Set<string>()]));
    for (const context of units) {
      needed.set(context, rulesIn(closures.get(context)!));
      for (const member of closures.get(context)!) {
        for (const target of edges(member, (c) => c.dynamicImports)) {
          contexts.get(target)?.add(context);
          targets.get(context)!.add(target);
        }
      }
    }
    // Nothing is certain for an entry, or for a dynamic entry that no chunk in the graph imports at all, since
    // something outside the graph loads it. Every other unit takes what all its contexts certainly hold once loaded: a
    // greatest fixpoint, narrowed from everything, since every load path starts at a unit where nothing is certain. A
    // unit is fetched alone only through a context; whenever it loads with a unit importing it statically, the sheet
    // of that importer keeps what it leaves out.
    const imported = new Set(keys.flatMap((key) => edges(key, (c) => c.imports)));
    const pending = new Set<string>();
    for (const key of units) {
      const root = chunk(key).isEntry || (contexts.get(key)!.size === 0 && !imported.has(key));
      inherited.set(key, root ? new Set() : null);
      if (root) for (const target of targets.get(key)!) pending.add(target);
    }
    for (const key of pending) {
      pending.delete(key);
      const current = inherited.get(key)!;
      let next = current && new Set(current);
      for (const context of contexts.get(key)!) {
        const before = inherited.get(context)!;
        if (!before) continue;
        const loaded = needed.get(context)!;
        if (!next) next = new Set([...loaded, ...before]);
        else for (const rule of next) if (!loaded.has(rule) && !before.has(rule)) next.delete(rule);
      }
      if (next && next.size !== current?.size) {
        inherited.set(key, next);
        for (const target of targets.get(key)!) pending.add(target);
      }
    }
  }

  // A sheet leaves out the sheets of the units in its closure, which always load with it. Units with equal closures
  // load together, so the first in stable order keeps the rules they share.
  const sheets = new Map<string, Set<string>>();
  const byClosure = [...needed.keys()].sort((a, b) => closures.get(a)!.size - closures.get(b)!.size || order(a, b));
  for (const key of byClosure) {
    const before = inherited.get(key);
    const rules = before ? new Set([...needed.get(key)!].filter((rule) => !before.has(rule))) : new Set<string>();
    for (const other of closures.get(key)!) for (const rule of sheets.get(other) ?? []) rules.delete(rule);
    sheets.set(key, rules);
  }

  const result: Plan = new Map();
  for (const key of units) {
    const rules = sheets.get(key);
    if (rules?.size)
      result.set(
        key,
        [...rules].sort((a, b) => rank.get(a)! - rank.get(b)!),
      );
  }
  return result;
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;

  type Spec = Partial<Omit<Chunk, "stableName">> & { rules?: string[] };
  const graphOf = (specs: Record<string, Spec>): Graph =>
    new Map(
      Object.entries(specs).map(([key, spec]) => [
        key,
        {
          modules: [key],
          imports: [],
          dynamicImports: [],
          isEntry: false,
          isDynamicEntry: false,
          ...spec,
          stableName: key,
        },
      ]),
    );
  const rulesOf = (specs: Record<string, Spec>) => (module: string) => specs[module]?.rules ?? [];
  const run = (specs: Record<string, Spec>, mode: Mode = "chunks") =>
    Object.fromEntries(plan(graphOf(specs), rulesOf(specs), mode));

  describe("plan", () => {
    it("gives a lazy unit only the rules its entry does not load", () => {
      const specs = {
        main: { isEntry: true, dynamicImports: ["page"], rules: ["a", "b"] },
        page: { isDynamicEntry: true, rules: ["b", "c"] },
      };
      expect(run(specs)).toEqual({ main: ["a", "b"], page: ["c"] });
      expect(run(specs, "single")).toEqual({ main: ["a", "b", "c"] });
    });

    it("counts a lazy unit's static imports, the entry chunk among them", () => {
      expect(
        run({
          main: { isEntry: true, dynamicImports: ["page"], rules: ["a"] },
          page: { isDynamicEntry: true, imports: ["main", "card"], rules: ["c"] },
          card: { rules: ["a", "d"] },
        }),
      ).toEqual({ main: ["a"], page: ["d", "c"] });
    });

    it("lets a nested unit inherit what every unit on the way loads", () => {
      const specs = {
        main: { isEntry: true, dynamicImports: ["blog"], rules: ["a"] },
        blog: { isDynamicEntry: true, dynamicImports: ["post"], rules: ["b"] },
        post: { isDynamicEntry: true, rules: ["a", "b", "c"] },
      };
      expect(run(specs)).toEqual({ main: ["a"], blog: ["b"], post: ["c"] });
      expect(run(specs, "single")).toEqual({ main: ["a", "b", "c"] });
    });

    it("keeps what any one of the units importing a unit lacks", () => {
      expect(
        run({
          one: { isEntry: true, dynamicImports: ["shared"], rules: ["a", "b"] },
          two: { isEntry: true, dynamicImports: ["shared"], rules: ["b", "c"] },
          shared: { isDynamicEntry: true, rules: ["a", "b", "c", "d"] },
        }),
      ).toEqual({ one: ["a", "b"], two: ["b", "c"], shared: ["a", "c", "d"] });
    });

    it("gives a unit that is also imported statically only what its importers do not carry", () => {
      expect(
        run({
          main: { isEntry: true, dynamicImports: ["page", "widget"], rules: ["a"] },
          page: { isDynamicEntry: true, imports: ["widget"], rules: ["a", "b", "w"] },
          widget: { isDynamicEntry: true, rules: ["a", "w", "x"] },
        }),
      ).toEqual({ main: ["a"], page: ["b"], widget: ["w", "x"] });
    });

    it("folds a unit the entry imports statically into the entry's sheet", () => {
      expect(
        run({
          main: { isEntry: true, imports: ["layout"], dynamicImports: ["layout"], rules: ["a"] },
          layout: { isDynamicEntry: true, dynamicImports: ["page"], rules: ["l"] },
          page: { isDynamicEntry: true, rules: ["a", "l", "p"] },
        }),
      ).toEqual({ main: ["l", "a"], page: ["p"] });
    });

    it("lets the importer keep what a statically imported unit leaves out for its other path", () => {
      expect(
        run({
          main: { isEntry: true, dynamicImports: ["blog", "page"], rules: ["a"] },
          blog: { isDynamicEntry: true, dynamicImports: ["widget"], rules: ["b"] },
          page: { isDynamicEntry: true, imports: ["widget"], rules: ["p"] },
          widget: { isDynamicEntry: true, rules: ["b", "w"] },
        }),
      ).toEqual({ main: ["a"], blog: ["b"], page: ["b", "p"], widget: ["w"] });
    });

    it("gives a dynamic entry that nothing in the graph imports every rule it needs", () => {
      expect(
        run({
          main: { isEntry: true, rules: ["a"] },
          worker: { isDynamicEntry: true, rules: ["a", "b"] },
        }),
      ).toEqual({ main: ["a"], worker: ["a", "b"] });
    });

    it("leaves a unit that only ever loads with its static importer to that importer's sheet", () => {
      expect(
        run({
          main: { isEntry: true, dynamicImports: ["page"], rules: ["a"] },
          page: { isDynamicEntry: true, imports: ["widget"], rules: ["p"] },
          widget: { isDynamicEntry: true, rules: ["a", "w"] },
        }),
      ).toEqual({ main: ["a"], page: ["w", "p"] });
    });

    it("converges on cycles of dynamic imports", () => {
      expect(
        run({
          main: { isEntry: true, dynamicImports: ["a"], rules: ["m"] },
          a: { isDynamicEntry: true, dynamicImports: ["b"], rules: ["m", "x"] },
          b: { isDynamicEntry: true, dynamicImports: ["a"], rules: ["x", "y"] },
        }),
      ).toEqual({ main: ["m"], a: ["x"], b: ["y"] });
    });

    it("gives no sheet to a unit with nothing new", () => {
      expect(
        run({
          main: { isEntry: true, dynamicImports: ["page"], rules: ["a"] },
          page: { isDynamicEntry: true, rules: ["a"] },
        }),
      ).toEqual({ main: ["a"] });
    });

    it("orders rules as they first run, so later rules of equal specificity still win", () => {
      const specs = {
        main: { isEntry: true, imports: ["vendor"], dynamicImports: ["page"], rules: ["wide", "narrow"] },
        vendor: { rules: ["reset", "wide"] },
        page: { isDynamicEntry: true, rules: ["hover", "narrow", "active"] },
      };
      expect(run(specs)).toEqual({ main: ["reset", "wide", "narrow"], page: ["hover", "active"] });
      expect(run(specs, "single")).toEqual({ main: ["reset", "wide", "narrow", "hover", "active"] });
    });

    it("plans the same sheets whatever order the chunks arrive in", () => {
      const specs: Record<string, Spec> = {
        main: { isEntry: true, imports: ["vendor"], dynamicImports: ["x", "y"], rules: ["r3", "r1"] },
        vendor: { rules: ["r2"] },
        x: { isDynamicEntry: true, imports: ["vendor", "card"], dynamicImports: ["z"], rules: ["r4", "r1"] },
        y: { isDynamicEntry: true, imports: ["card"], dynamicImports: ["z"], rules: ["r5"] },
        card: { rules: ["r6", "r4"] },
        z: { isDynamicEntry: true, imports: ["card"], rules: ["r7", "r6", "r4", "r5"] },
      };
      const shuffled = Object.fromEntries(Object.entries(specs).reverse());
      for (const mode of ["chunks", "single"] as const) {
        expect(JSON.stringify([...plan(graphOf(shuffled), rulesOf(shuffled), mode)])).toBe(
          JSON.stringify([...plan(graphOf(specs), rulesOf(specs), mode)]),
        );
      }
      expect(run(specs)).toEqual({
        main: ["r2", "r3", "r1"],
        x: ["r6", "r4"],
        y: ["r6", "r4", "r5"],
        z: ["r5", "r7"],
      });
    });
  });
}
