import { LAYER_ORDER } from "kiln/core";

import type { Graph } from "./plan.ts";

export interface Verdict {
  // A loaded chunk needs a rule that no loaded sheet holds.
  missing: string[];
  // A sheet holds a rule that every load path had already loaded before it.
  redundant: string[];
  // A sheet does not start with the full layer order.
  unordered: string[];
  // Two sheets fetched together hold the same rule although one's chunk always loads with the other.
  overlapping: string[];
  // Copies of a rule fetched while it was already loaded or alongside another copy, over every load path. Some are
  // inherent to one sheet per unit: two units loaded together that share a component each carry its rules, since
  // either may also load alone.
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
  const verdict: Verdict = { missing: [], redundant: [], unordered: [], overlapping: [], repeats: 0 };
  const universe = new Set([...graph.values()].flatMap((chunk) => chunk.modules.flatMap((module) => rulesOf(module))));
  // Rule bodies are unique to their class, so a sheet holds a rule when it contains the body.
  const bodyOf = (rule: string) => /^@layer k\d+\{([\s\S]*)\}$/.exec(textOf(rule))?.[1] ?? textOf(rule);
  const held = new Map<string, Set<string>>();
  for (const [key, css] of sheets) {
    if (!css.startsWith(LAYER_ORDER)) verdict.unordered.push(key);
    held.set(key, new Set([...universe].filter((rule) => css.includes(bodyOf(rule)))));
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

  const load = (chunks: ReadonlySet<string>, rules: ReadonlySet<string>, added: Iterable<string>, path: string) => {
    const now = new Set(chunks);
    const fetched: string[] = [];
    for (const key of added) {
      if (now.has(key)) continue;
      now.add(key);
      if (held.has(key)) fetched.push(key);
    }
    const loaded = new Set(rules);
    const holders = new Map<string, string[]>();
    for (const key of fetched) {
      if (!needed.has(key)) needed.set(key, new Set());
      for (const rule of held.get(key)!) {
        if (!rules.has(rule)) needed.get(key)!.add(rule);
        if (loaded.has(rule)) verdict.repeats++;
        loaded.add(rule);
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
    for (const key of now) {
      for (const module of graph.get(key)!.modules) {
        for (const rule of rulesOf(module)) {
          if (!loaded.has(rule)) verdict.missing.push(`${path}: ${key} needs ${rule}`);
        }
      }
    }
    // The loaded rules follow from the loaded chunks, since a sheet arrives with its chunk.
    const state = [...now].sort().join("\0");
    if (visited.has(state)) return;
    visited.add(state);
    for (const key of now) {
      for (const target of graph.get(key)!.dynamicImports) {
        if (graph.has(target) && !now.has(target)) load(now, loaded, closure(target), `${path} > ${target}`);
      }
    }
  };
  for (const [key, chunk] of graph) if (chunk.isEntry) load(new Set(), new Set(), closure(key), key);

  for (const [key, rules] of needed) {
    for (const rule of held.get(key)!) if (!rules.has(rule)) verdict.redundant.push(`${key} holds ${rule}`);
  }
  verdict.missing = [...new Set(verdict.missing)];
  verdict.overlapping = [...new Set(verdict.overlapping)];
  return verdict;
}
