import { LAYER_ORDER } from "../../core/index.ts";

import type { Graph } from "./plan.ts";
import { groupOf } from "./sheet.ts";

export interface Verdict {
  // A loaded chunk needs a rule that no loaded sheet holds.
  missing: string[];
  // A sheet holds a rule that every load path had already loaded before it.
  redundant: string[];
  // A sheet does not start with the full layer order.
  unordered: string[];
  // Two sheets fetched together hold the same rule although one's chunk always loads with the other.
  overlapping: string[];
  // Two rules of one group that loaded chunks need, where the one that first runs later does not come later in the
  // loaded sheets, so it would not win where both apply as it does at runtime.
  misordered: string[];
  // Copies of a rule fetched while it was already loaded or alongside another copy, summed over the load steps walked:
  // every step into a load state counts, but each state's onward steps are walked once. Some are inherent to one sheet
  // per unit: two units loaded together that share a component each carry its rules, since either may also load alone.
  repeats: number;
}

// Walks every load path of a chunk graph, independently of the planner: an entry loads its static closure, then any
// dynamic import of a loaded chunk loads the part of its closure not yet loaded, with the sheets of those chunks.
// The number of states is exponential in the number of chunks, so it suits test graphs only.
export function verify(
  graph: Graph,
  rulesOf: (module: string) => readonly string[],
  sheets: ReadonlyMap<string, string>,
  textOf: (rule: string) => string,
): Verdict {
  const verdict: Verdict = { missing: [], redundant: [], unordered: [], overlapping: [], misordered: [], repeats: 0 };
  const universe = new Set([...graph.values()].flatMap((chunk) => chunk.modules.flatMap((module) => rulesOf(module))));
  // Rule bodies are unique to their class, so a sheet holds a rule when it contains the body.
  const bodyOf = (rule: string) => /^@layer k\d+\{([\s\S]*)\}$/.exec(textOf(rule))?.[1] ?? textOf(rule);
  const group = (rule: string) => groupOf(rule, textOf(rule));

  // The order in which rules first run: an entry's static imports before its own modules, then the units it imports
  // dynamically, breadth first.
  const rank = new Map<string, number>();
  const keys = [...graph.keys()].sort((a, b) => {
    const [x, y] = [graph.get(a)!.stableName, graph.get(b)!.stableName];
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const queue = keys.filter((key) => graph.get(key)!.isEntry);
  const ranked = new Set<string>();
  const visit = (key: string) => {
    if (ranked.has(key)) return;
    ranked.add(key);
    const chunk = graph.get(key)!;
    for (const next of chunk.imports) if (graph.has(next)) visit(next);
    for (const module of chunk.modules)
      for (const rule of rulesOf(module)) if (!rank.has(rule)) rank.set(rule, rank.size);
    queue.push(...chunk.dynamicImports.filter((next) => graph.has(next)));
  };
  for (const key of queue) visit(key);
  for (const key of keys) visit(key);
  const byRank = (a: string, b: string) => rank.get(a)! - rank.get(b)!;

  const held = new Map<string, Set<string>>();
  for (const [key, css] of sheets) {
    if (!css.startsWith(LAYER_ORDER)) verdict.unordered.push(key);
    held.set(key, new Set([...universe].filter((rule) => css.includes(bodyOf(rule)))));
    const rules = [...held.get(key)!].sort(byRank);
    for (const [index, rule] of rules.entries()) {
      for (const later of rules.slice(index + 1)) {
        if (group(rule) === group(later) && css.indexOf(bodyOf(later)) < css.indexOf(bodyOf(rule)))
          verdict.misordered.push(`${key} holds ${later} before ${rule}`);
      }
    }
  }

  const closures = new Map<string, Set<string>>();
  const closure = (key: string) => {
    if (closures.has(key)) return closures.get(key)!;
    const seen = new Set([key]);
    for (const current of seen) for (const next of graph.get(current)!.imports) if (graph.has(next)) seen.add(next);
    closures.set(key, seen);
    return seen;
  };
  // For each sheet that some load path fetches, the rules one of them still lacked when it arrived. A sheet no path
  // fetches belongs to a chunk whose importer is not in the graph.
  const needed = new Map<string, Set<string>>();
  const visited = new Set<string>();

  // `last` holds the load step that last fetched each loaded rule; sheets fetched in one step have no set order.
  const load = (
    chunks: ReadonlySet<string>,
    rules: ReadonlySet<string>,
    last: ReadonlyMap<string, number>,
    depth: number,
    added: Iterable<string>,
    path: string,
  ) => {
    const now = new Set(chunks);
    const fetched: string[] = [];
    for (const key of added) {
      if (now.has(key)) continue;
      now.add(key);
      if (held.has(key)) fetched.push(key);
    }
    const loaded = new Set(rules);
    const step = new Map(last);
    const holders = new Map<string, string[]>();
    for (const key of fetched) {
      if (!needed.has(key)) needed.set(key, new Set());
      for (const rule of held.get(key)!) {
        if (!rules.has(rule)) needed.get(key)!.add(rule);
        if (loaded.has(rule)) verdict.repeats++;
        loaded.add(rule);
        step.set(rule, depth);
        holders.set(rule, [...(holders.get(rule) ?? []), key]);
      }
    }
    for (const [rule, keys] of holders) {
      for (const key of keys) {
        for (const other of keys) {
          if (other !== key && closure(key).has(other))
            verdict.overlapping.push(`${path}: ${key} and ${other} hold ${rule}`);
        }
      }
    }
    const groups = new Map<string, Set<string>>();
    for (const key of now) {
      for (const module of graph.get(key)!.modules) {
        for (const rule of rulesOf(module)) {
          if (!loaded.has(rule)) verdict.missing.push(`${path}: ${key} needs ${rule}`);
          else if (groups.has(group(rule))) groups.get(group(rule))!.add(rule);
          else groups.set(group(rule), new Set([rule]));
        }
      }
    }
    for (const members of groups.values()) {
      const rules = [...members].sort(byRank);
      for (const [index, rule] of rules.entries()) {
        for (const later of rules.slice(index + 1)) {
          if (step.get(later)! < step.get(rule)!) verdict.misordered.push(`${path}: ${rule} comes after ${later}`);
        }
      }
    }
    // The loaded rules follow from the loaded chunks, since a sheet arrives with its chunk.
    const state = [...now].sort().join("\0");
    if (visited.has(state)) return;
    visited.add(state);
    for (const key of now) {
      for (const target of graph.get(key)!.dynamicImports) {
        if (graph.has(target) && !now.has(target))
          load(now, loaded, step, depth + 1, closure(target), `${path} > ${target}`);
      }
    }
  };
  for (const [key, chunk] of graph) if (chunk.isEntry) load(new Set(), new Set(), new Map(), 0, closure(key), key);

  for (const [key, rules] of needed) {
    for (const rule of held.get(key)!) if (!rules.has(rule)) verdict.redundant.push(`${key} holds ${rule}`);
  }
  verdict.missing = [...new Set(verdict.missing)];
  verdict.overlapping = [...new Set(verdict.overlapping)];
  verdict.misordered = [...new Set(verdict.misordered)];
  return verdict;
}
