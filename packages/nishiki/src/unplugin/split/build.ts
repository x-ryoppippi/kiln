import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { compileModule, type TransformOptions } from "../transform.ts";
import { plan, type Graph, type Mode, type Planned } from "./plan.ts";
import { renderSheet, usedOrder } from "./sheet.ts";

// The fields of a chunk that Vite, Rollup and Rolldown all pass to `renderChunk` in `meta.chunks`.
export interface RenderedChunk {
  fileName: string;
  moduleIds: readonly string[];
  modules: Readonly<Record<string, { renderedLength: number }>>;
  imports: readonly string[];
  dynamicImports: readonly string[];
  exports: readonly string[];
  isEntry: boolean;
  isDynamicEntry: boolean;
  facadeModuleId: string | null;
}

// The rules nishiki compiled in one build, which every output of the build plans its sheets from.
export interface Build {
  // Rule classes by full module id, query included, for every module nishiki transformed.
  moduleRules: Map<string, readonly string[]>;
  ruleText: Map<string, string>;
}

export const splitMode = (options: TransformOptions): Mode =>
  typeof options.extract === "object" && options.extract.split === "single" ? "single" : "chunks";

export function createBuild(): Build {
  return { moduleRules: new Map(), ruleText: new Map() };
}

// A module's rules as the transform returns them: class and `@layer` text.
export type Rules = readonly (readonly [rule: string, text: string])[];

export function record(build: Build, id: string, rules: Rules): readonly string[] {
  for (const [rule, text] of rules) build.ruleText.set(rule, text);
  const classes = rules.map(([rule]) => rule);
  build.moduleRules.set(id, classes);
  return classes;
}

export function graphOf(chunks: Readonly<Record<string, RenderedChunk>>, root: string): Graph {
  const name = (id: string) => path.relative(root, id);
  return new Map(
    Object.entries(chunks).map(([key, chunk]) => [
      key,
      {
        modules: chunk.moduleIds.filter((id) => chunk.modules[id]?.renderedLength !== 0),
        imports: chunk.imports,
        dynamicImports: chunk.dynamicImports,
        isEntry: chunk.isEntry,
        isDynamicEntry: chunk.isDynamicEntry,
        stableName: chunk.facadeModuleId ? name(chunk.facadeModuleId) : chunk.moduleIds.map(name).sort().join("\n"),
      },
    ]),
  );
}

// The rules of a module by its id. A module the transform never saw in this process, such as one restored from a cache,
// is compiled again from the file on disk. For a query variant that is the whole file, a superset of its rules, as the
// `load` fallback explains.
export function rulesOf(
  build: Build,
  options: TransformOptions,
  compiles: (id: string) => boolean,
): (id: string) => readonly string[] {
  return (id) => {
    const known = build.moduleRules.get(id);
    if (known) return known;
    const filename = id.replace(/[?#].*$/, "");
    const result =
      compiles(id) && existsSync(filename)
        ? compileModule(readFileSync(filename, "utf8"), id, options, { cssImport: false, configImport: true })
        : null;
    return record(build, id, result?.rules ?? []);
  };
}

// Plans the sheets of one output and emits each through `emit`, which returns its file name; the result maps chunk
// keys to those names.
export function emitSheets(
  build: Build,
  graph: Graph,
  mode: Mode,
  options: TransformOptions,
  compiles: (id: string) => boolean,
  emit: (source: string) => string,
): Map<string, string> {
  const sheets = new Map<string, string>();
  const rendered = renderPlan(plan(graph, rulesOf(build, options, compiles), mode), (rule) =>
    build.ruleText.get(rule)!,
  );
  for (const [key, css] of rendered) sheets.set(key, emit(css));
  return sheets;
}

// The CSS of each planned sheet.
export function renderPlan(planned: Planned, textOf: (rule: string) => string): Map<string, string> {
  // Leading sheets declare every layer the output's sheets use, in the order of the full table, so a sheet that
  // leaves the statement out only uses layers declared before it. The runtime's statement declares the full table: a
  // rule it inserts in a layer no sheet uses still lands in its place when the runtime's statement comes first in the
  // document, as React hoists it to the start of the head.
  const order = usedOrder([...planned.sheets.values()].flatMap((classes) => classes.map(textOf)));
  const sheets = new Map<string, string>();
  for (const [key, classes] of planned.sheets) {
    sheets.set(key, renderSheet(classes, textOf, planned.leading.has(key) ? order : null));
  }
  return sheets;
}
