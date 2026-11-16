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

// Moves rules that many lazy units would each fetch into the sheet of the entry that loads them.
export interface Hoisting {
  // The least share of an entry's lazy units whose sheets would hold a rule for the entry's sheet to take it.
  share: number;
  // The most bytes of rules one entry's sheet takes.
  bytes: number;
  sizeOf: (rule: string) => number;
  // Rules of different groups never compete for one declaration, so their order across sheets does not matter.
  groupOf: (rule: string) => string;
}

export function plan(
  graph: Graph,
  rulesOf: (module: string) => readonly string[],
  mode: Mode,
  hoisting?: Hoisting,
): Plan {
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

  // Rolldown leaves `isDynamicEntry` off a chunk that a group merged a dynamically imported module into.
  const loadedLazily = new Set(keys.flatMap((key) => edges(key, (c) => c.dynamicImports)));
  const units = keys.filter((key) => chunk(key).isEntry || chunk(key).isDynamicEntry || loadedLazily.has(key));
  const needed = new Map<string, Set<string>>();
  // What is certainly loaded whenever a unit arrives through a dynamic import; null while that may be anything.
  const inherited = new Map<string, Set<string> | null>();
  // The units whose closure imports each unit dynamically, and the units each unit's closure imports dynamically.
  const contexts = new Map(units.map((key) => [key, new Set<string>()]));
  const targets = new Map(units.map((key) => [key, new Set<string>()]));

  if (mode === "single") {
    for (const key of units) {
      if (!chunk(key).isEntry) continue;
      needed.set(key, rulesIn(reach(key, (c) => [...c.imports, ...c.dynamicImports])));
      inherited.set(key, new Set());
    }
  } else {
    for (const context of units) {
      needed.set(context, rulesIn(closures.get(context)!));
      for (const member of closures.get(context)!) {
        for (const target of edges(member, (c) => c.dynamicImports)) {
          contexts.get(target)?.add(context);
          targets.get(context)!.add(target);
        }
      }
    }
  }

  // Nothing is certain for an entry, or for a dynamic entry that no chunk in the graph imports at all, since something
  // outside the graph loads it. Every other unit takes what all its contexts certainly hold once loaded: a greatest
  // fixpoint, narrowed from everything, since every load path starts at a unit where nothing is certain. A unit is
  // fetched alone only through a context; whenever it loads with a unit importing it statically, the sheet of that
  // importer keeps what it leaves out.
  const imported = new Set(keys.flatMap((key) => edges(key, (c) => c.imports)));
  const settle = () => {
    if (mode === "single") return;
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
  };

  // A sheet leaves out the sheets of the units in its closure, which always load with it. Units with equal closures
  // load together, so the first in stable order keeps the rules they share.
  const byClosure = [...needed.keys()].sort((a, b) => closures.get(a)!.size - closures.get(b)!.size || order(a, b));
  const sheetsOf = () => {
    const sheets = new Map<string, Set<string>>();
    for (const key of byClosure) {
      const before = inherited.get(key);
      const rules = before ? new Set([...needed.get(key)!].filter((rule) => !before.has(rule))) : new Set<string>();
      for (const other of closures.get(key)!) for (const rule of sheets.get(other) ?? []) rules.delete(rule);
      sheets.set(key, rules);
    }
    return sheets;
  };

  settle();
  let sheets = sheetsOf();
  if (mode === "chunks" && hoisting) {
    // An entry's sheet comes first only if no other entry, or unit loaded from outside the graph, ever loads it later.
    const roots = units.filter((key) => inherited.get(key)?.size === 0 && contexts.get(key)!.size === 0);
    const reached = (root: string) => {
      const walk = new Set([root]);
      for (const unit of walk) for (const target of targets.get(unit)!) walk.add(target);
      return new Set([...walk].flatMap((unit) => [...closures.get(unit)!]));
    };
    const hoisted = units
      .filter((key) => chunk(key).isEntry && roots.every((root) => root === key || !reached(root).has(key)))
      .map((entry) => [entry, hoist(entry, hoisting, sheets)] as const);
    if (hoisted.some(([, rules]) => rules.length)) {
      for (const [entry, rules] of hoisted) for (const rule of rules) needed.get(entry)!.add(rule);
      settle();
      sheets = sheetsOf();
    }
  }

  // The rules that the sheets of many units an entry's pages load would each fetch again, moved into the entry's sheet
  // within the byte budget. A sheet loaded after the entry's could hold a rule of the same group that runs before a
  // hoisted rule, which would then lose to the hoisted rule where it won before; such a rule is hoisted only with every
  // rule that it would overtake.
  function hoist(entry: string, { share, bytes, sizeOf, groupOf }: Hoisting, sheets: Map<string, Set<string>>) {
    const base = needed.get(entry)!;
    // The lazy units that load after the entry: its dynamic imports, theirs, and so on.
    const served = new Set<string>();
    const walk = new Set([entry]);
    for (const unit of walk) {
      for (const target of targets.get(unit)!) {
        if (closures.get(entry)!.has(target)) continue;
        served.add(target);
        walk.add(target);
      }
    }
    // The entry's rules that another sheet loaded after it holds too, which then comes after a hoisted rule.
    const again = new Set<string>();
    for (const unit of served) {
      for (const member of closures.get(unit)!) {
        if (member !== entry) for (const rule of sheets.get(member) ?? []) if (base.has(rule)) again.add(rule);
      }
    }
    const count = new Map<string, number>();
    for (const unit of served) for (const rule of sheets.get(unit) ?? []) count.set(rule, (count.get(rule) ?? 0) + 1);
    const allowed = new Set([...count.keys()].filter((rule) => count.get(rule)! >= share * served.size));
    if (!allowed.size) return [];

    // The rules each candidate would overtake: those of its group that run before it among what a unit has loaded.
    const overtakes = new Map([...allowed].map((rule) => [rule, new Set<string>()]));
    for (const unit of served) {
      const groups = new Map<string, string[]>();
      for (const rule of new Set([...needed.get(unit)!, ...(inherited.get(unit) ?? [])])) {
        if (base.has(rule) && !again.has(rule)) continue;
        const group = groupOf(rule);
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group)!.push(rule);
      }
      for (const rules of groups.values()) {
        rules.sort((a, b) => rank.get(a)! - rank.get(b)!);
        rules.forEach((rule, index) => {
          const before = overtakes.get(rule);
          if (before) for (const earlier of rules.slice(0, index)) before.add(earlier);
        });
      }
    }
    for (let changed = true; changed;) {
      changed = false;
      for (const rule of allowed) {
        if ([...overtakes.get(rule)!].some((earlier) => !allowed.has(earlier))) {
          allowed.delete(rule);
          changed = true;
        }
      }
    }

    // The most widely fetched rules first, each with the rules it would overtake, while they fit the budget.
    const chosen = new Set<string>();
    let spent = 0;
    const priority = [...allowed].sort((a, b) => count.get(b)! - count.get(a)! || rank.get(a)! - rank.get(b)!);
    for (const rule of priority) {
      if (chosen.has(rule)) continue;
      const taken = new Set([rule]);
      for (const member of taken)
        for (const earlier of overtakes.get(member)!) if (!chosen.has(earlier)) taken.add(earlier);
      const size = [...taken].reduce((sum, member) => sum + sizeOf(member), 0);
      if (spent + size > bytes) continue;
      spent += size;
      for (const member of taken) chosen.add(member);
    }
    return [...chosen];
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

    it("counts a chunk imported dynamically as a unit even when it is not marked as a dynamic entry", () => {
      expect(
        run({
          main: { isEntry: true, imports: ["vendor"], rules: ["a"] },
          admin: { isEntry: true, dynamicImports: ["vendor"] },
          vendor: { rules: ["b"] },
        }),
      ).toEqual({ main: ["a"], vendor: ["b"] });
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

  describe("plan with hoisting", () => {
    // Every rule weighs one byte, and rules with the same digits share a group.
    const hoisting = (share: number, bytes = Infinity): Hoisting => ({
      share,
      bytes,
      sizeOf: () => 1,
      groupOf: (rule) => rule.replace(/^\D+/, ""),
    });
    const hoisted = (specs: Record<string, Spec>, options: Hoisting, mode: Mode = "chunks") =>
      Object.fromEntries(plan(graphOf(specs), rulesOf(specs), mode, options));
    const routes = (rules: Record<string, string[]>): Record<string, Spec> => ({
      main: { isEntry: true, dynamicImports: Object.keys(rules), rules: ["a0"] },
      ...Object.fromEntries(Object.entries(rules).map(([key, list]) => [key, { isDynamicEntry: true, rules: list }])),
    });

    it("moves a rule that at least the share of lazy units would fetch into the entry's sheet", () => {
      const specs = routes({ one: ["b2", "s1"], two: ["c2", "s1"], three: ["d2", "s1"], four: ["e2"] });
      expect(hoisted(specs, hoisting(0.75))).toEqual({
        main: ["a0", "s1"],
        one: ["b2"],
        two: ["c2"],
        three: ["d2"],
        four: ["e2"],
      });
      expect(hoisted(specs, hoisting(0.8))).toEqual(run(specs));
    });

    it("takes the most widely fetched rules first while they fit the budget", () => {
      const specs = routes({ one: ["s1", "t2"], two: ["s1", "t2"], three: ["s1", "u3"], four: ["s1", "u3"] });
      expect(hoisted(specs, hoisting(0.5, 2))).toEqual({ main: ["a0", "s1", "t2"], three: ["u3"], four: ["u3"] });
    });

    it("hoists nothing in single mode, whose one sheet holds every rule already", () => {
      const specs = routes({ one: ["s1"], two: ["s1"] });
      expect(hoisted(specs, hoisting(0.5), "single")).toEqual(run(specs, "single"));
    });

    it("keeps a rule where it is while a rule of its group that runs before it stays in a later sheet", () => {
      // `one` runs b1 before s1: with s1 in the entry's sheet and b1 in one's, b1 would come last and win instead.
      const specs = routes({ one: ["b1", "s1"], two: ["s1"], three: ["s1"] });
      expect(hoisted(specs, hoisting(0.6))).toEqual(run(specs));
      // Rules of different groups never decide anything between them.
      expect(hoisted(specs, { ...hoisting(0.6), groupOf: (rule) => rule })).toEqual({
        main: ["a0", "s1"],
        one: ["b1"],
      });
    });

    it("hoists a rule only with the rules of its group it would overtake", () => {
      const specs = routes({ one: ["b1", "s1"], two: ["b1", "s1"], three: ["s1"] });
      expect(hoisted(specs, hoisting(0.6))).toEqual({ main: ["a0", "b1", "s1"] });
      // s1 needs b1 beside it, which a budget of one rule has no room for; b1 alone fits.
      expect(hoisted(specs, hoisting(0.6, 1))).toEqual({
        main: ["a0", "b1"],
        one: ["s1"],
        two: ["s1"],
        three: ["s1"],
      });
    });

    it("counts nested lazy units, and keeps a rule in the sheet of a unit another entry also loads", () => {
      const specs: Record<string, Spec> = {
        main: { isEntry: true, dynamicImports: ["blog", "shop"], rules: ["a0"] },
        admin: { isEntry: true, dynamicImports: ["post", "panel"], rules: ["z0"] },
        blog: { isDynamicEntry: true, dynamicImports: ["post"], rules: ["s1"] },
        shop: { isDynamicEntry: true, rules: ["s1"] },
        post: { isDynamicEntry: true, rules: ["p2", "s1"] },
        panel: { isDynamicEntry: true, rules: ["q3"] },
      };
      expect(hoisted(specs, hoisting(0.6))).toEqual({
        main: ["a0", "s1"],
        admin: ["z0"],
        post: ["p2", "s1"],
        panel: ["q3"],
      });
    });
  });
}
