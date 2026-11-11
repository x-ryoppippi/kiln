import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { compileModule, type TransformOptions } from "../transform.ts";
import { plan, type Graph, type Mode } from "./plan.ts";
import { renderSheet } from "./sheet.ts";

// The fields of a chunk that Vite, Rollup and Rolldown all pass to `renderChunk` in `meta.chunks`.
export interface RenderedChunk {
  fileName: string;
  moduleIds: readonly string[];
  modules: Readonly<Record<string, { renderedLength: number; code?: string | null }>>;
  imports: readonly string[];
  dynamicImports: readonly string[];
  isEntry: boolean;
  isDynamicEntry: boolean;
  facadeModuleId: string | null;
}

// The rules kiln compiled in one build, which every output of the build plans its sheets from.
export interface Build {
  // Rule classes by full module id, query included, for every module kiln transformed.
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

// Plans the sheets of one output and emits each through `emit`, which returns its file name; the result maps chunk
// keys to those names. A module the transform never saw in this process, such as one restored from a cache, is
// compiled again from the file on disk. For a query variant that is the whole file, a superset of its rules, as the
// `load` fallback explains.
export function emitSheets(
  build: Build,
  graph: Graph,
  mode: Mode,
  options: TransformOptions,
  compiles: (id: string) => boolean,
  emit: (source: string) => string,
): Map<string, string> {
  const rulesOf = (id: string) => {
    const known = build.moduleRules.get(id);
    if (known) return known;
    const filename = id.replace(/[?#].*$/, "");
    const result =
      compiles(id) && existsSync(filename) ? compileModule(readFileSync(filename, "utf8"), id, options, false) : null;
    return record(build, id, result?.rules ?? []);
  };
  const sheets = new Map<string, string>();
  for (const [key, classes] of plan(graph, rulesOf, mode)) {
    sheets.set(key, emit(renderSheet(classes, (rule) => build.ruleText.get(rule)!)));
  }
  return sheets;
}
