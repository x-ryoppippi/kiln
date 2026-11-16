import path from "node:path";

import { hash } from "../../core/index.ts";
import type { TransformOptions } from "../transform.ts";
import { createBuild, record, rulesOf, splitMode, type Build, type Rules } from "./build.ts";
import { plan, type Chunk as Unit, type Mode } from "./plan.ts";
import { renderSheet } from "./sheet.ts";

// A chunk of a webpack or Rspack build, which loads with every other chunk of the chunk group that a page or a dynamic
// import loads.
export interface ChunkNode {
  // Names the chunk the same way in every build.
  name: string;
  // kiln's CSS modules in the chunk, in the order they run.
  modules: readonly string[];
  // The chunk groups that the code in the chunk imports dynamically, by key.
  dynamicImports: readonly string[];
  // Whether the CSS pipeline emitted a stylesheet for the chunk, the only file its rules can go in.
  stylesheet: boolean;
}

export interface GroupNode {
  // Names the group the same way in every build.
  name: string;
  chunks: readonly string[];
  // An entrypoint, which a page loads, rather than a group that a dynamic import loads.
  initial: boolean;
  // The groups that are loaded whenever this one is, such as the entrypoints an entrypoint depends on.
  loadsWith: readonly string[];
}

// Plans the rules each chunk's stylesheet gets. A chunk group loads all its chunks at once, but a chunk that several
// groups share loads with whichever of them comes first, with its stylesheet. So the units of the plan are the groups
// and the shared chunks: a shared chunk's sheet holds the rules of its modules that are not certainly loaded when it
// arrives, and a group's sheet the rest of the rules its chunks need, which are those of the chunks only it loads. Its
// sheet goes in the stylesheet of one of those, which the CSS pipeline emits for every chunk with a kiln module.
// With `split: "single"` only entrypoints are units, and an entrypoint's sheet goes in the stylesheet of one of its
// chunks, preferably one that loads with it alone. The result also lists the groups whose rules have no stylesheet to go in.
export function planChunks(
  chunks: ReadonlyMap<string, ChunkNode>,
  groups: ReadonlyMap<string, GroupNode>,
  rulesOf: (module: string) => readonly string[],
  mode: Mode,
): { sheets: Map<string, string[]>; unplaced: string[] } {
  const chunkKey = (key: string) => "chunk:" + key;
  const groupKey = (key: string) => "group:" + key;
  const memberships = new Map<string, string[]>();
  for (const [key, group] of groups) {
    for (const chunk of group.chunks) memberships.set(chunk, [...(memberships.get(chunk) ?? []), key]);
  }
  const shared = (chunk: string) => mode === "chunks" && memberships.get(chunk)!.length > 1;
  const loaded = new Map<string, Set<string>>();
  const loadedWith = (key: string): Set<string> => {
    let members = loaded.get(key);
    if (members) return members;
    members = new Set(groups.get(key)!.chunks);
    loaded.set(key, members);
    for (const other of groups.get(key)!.loadsWith) for (const chunk of loadedWith(other)) members.add(chunk);
    return members;
  };

  const graph = new Map<string, Unit>();
  for (const [key, chunk] of chunks) {
    if (!memberships.has(key)) continue;
    const of = memberships.get(key)!.map((group) => groups.get(group)!);
    const always = memberships
      .get(key)!
      .map(loadedWith)
      .reduce((common, members) => new Set([...common].filter((other) => members.has(other))));
    graph.set(chunkKey(key), {
      modules: chunk.modules,
      // Only shared chunks: a chunk that one group loads holds rules for that group's sheet.
      imports: shared(key)
        ? [...always].filter((other) => other !== key && chunks.has(other) && shared(other)).map(chunkKey)
        : [],
      dynamicImports: [],
      isEntry: shared(key) && of.some((group) => group.initial),
      isDynamicEntry: shared(key) && of.some((group) => !group.initial),
      // Of shared chunks that always load together, the first keeps the rules they share, so it should have a stylesheet.
      stableName: chunkKey((chunk.stylesheet ? "0" : "1") + chunk.name),
    });
  }
  // A group, not a chunk in it, imports dynamically what its chunks do: a chunk's code runs once a group loads it, so
  // what is certainly loaded then follows from the group.
  const targets = (group: GroupNode) =>
    [...new Set(group.chunks.flatMap((chunk) => chunks.get(chunk)?.dynamicImports ?? []))]
      .filter((target) => groups.has(target))
      .flatMap((target) => [
        groupKey(target),
        ...groups
          .get(target)!
          .chunks.filter((chunk) => chunks.has(chunk) && shared(chunk))
          .map(chunkKey),
      ]);
  for (const [key, group] of groups) {
    graph.set(groupKey(key), {
      modules: [],
      imports: [
        ...group.chunks.filter((chunk) => chunks.has(chunk)).map(chunkKey),
        ...group.loadsWith.filter((other) => groups.has(other)).map(groupKey),
      ],
      dynamicImports: targets(group),
      isEntry: group.initial,
      isDynamicEntry: !group.initial,
      stableName: groupKey(group.name),
    });
  }

  const sheets = new Map<string, string[]>();
  const unplaced: string[] = [];
  const add = (chunk: string, classes: readonly string[]) =>
    sheets.set(chunk, [...new Set([...(sheets.get(chunk) ?? []), ...classes])]);
  for (const [node, classes] of plan(graph, rulesOf, mode)) {
    if (node.startsWith("chunk:")) {
      add(node.slice("chunk:".length), classes);
      continue;
    }
    const key = node.slice("group:".length);
    const rank = (chunk: string) => memberships.get(chunk)!.length;
    const carrier = groups
      .get(key)!
      .chunks.filter((chunk) => chunks.get(chunk)?.stylesheet && !shared(chunk))
      .sort((a, b) => rank(a) - rank(b) || (chunks.get(a)!.name < chunks.get(b)!.name ? -1 : 1))[0];
    if (carrier === undefined) unplaced.push(key);
    else add(carrier, classes);
  }
  return { sheets, unplaced };
}

// The parts of webpack's and Rspack's compiler, compilation and chunk graph the adapter uses, which both provide although
// their typings differ elsewhere. Rspack hands out a new object for a chunk or a chunk group on every access, so they
// are told apart by their ids, never by identity.
interface Module {
  type: string;
  modules?: Iterable<Module>;
  blocks?: Iterable<Block>;
  nameForCondition?(): string | null | undefined;
  identifier(): string;
}

interface Block {
  blocks?: Iterable<Block>;
}

interface Chunk {
  id: string | number | null | undefined;
  name?: string | null;
  files: Iterable<string>;
  groupsIterable: Iterable<ChunkGroup>;
}

interface ChunkGroup {
  name?: string | null;
  chunks: readonly Chunk[];
  isInitial(): boolean;
  getParents(): readonly ChunkGroup[];
  getModulePostOrderIndex(module: Module): number | null | undefined;
}

interface Source {
  source(): string | Buffer;
}

interface Compilation {
  chunks: Iterable<Chunk>;
  chunkGroups: Iterable<ChunkGroup>;
  chunkGraph: {
    getChunkModulesIterable(chunk: Chunk): Iterable<Module>;
    getBlockChunkGroup(block: Block): ChunkGroup | null | undefined;
  };
  errors: unknown[];
  warnings: unknown[];
  hooks: {
    processAssets: { tap(options: { name: string; stage: number }, callback: () => void): void };
  };
  getAsset(file: string): { source: Source } | undefined;
  updateAsset(file: string, source: Source): void;
}

interface Compiler {
  context: string;
  options: {
    mode?: string;
    optimization: { realContentHash?: boolean };
    cache?: unknown;
  };
  platform?: { web?: boolean | null };
  hooks: {
    afterEnvironment: { tap(name: string, callback: () => void): void };
    thisCompilation: { tap(name: string, callback: (compilation: Compilation) => void): void };
  };
  webpack: {
    Compilation: { PROCESS_ASSETS_STAGE_PRE_PROCESS: number };
    WebpackError: new (message: string) => Error;
    sources: {
      ConcatSource: new (...sources: (Source | string)[]) => Source;
      ReplaceSource: new (source: Source) => Source & { replace(start: number, end: number, text: string): void };
    };
  };
}

// Whether kiln plans the build's sheets, decided once its options are complete.
interface State {
  build: Build;
  mode: Mode;
}

const CSS_ID = /\.kiln\.css$/;
const PLACEHOLDER = /\/\*! kiln:[0-9a-z]+ \*\/\s*/g;

// What a kiln CSS module holds in a build whose sheets kiln plans. Not nothing: splitChunks' minSize never holds back a
// module of size 0, which would give kiln's CSS modules chunks, and stylesheets, of their own, and the CSS pipeline
// would hash every such stylesheet alike. A legal comment is one that CSS loaders and Lightning CSS keep.
export const placeholder = (cssId: string): string => `/*! kiln:${hash(cssId)} */\n`;

// kiln's CSS modules are never on disk, so unplugin names each after its id, URI-encoded: webpack's as `_virtual_<id>`,
// Rspack's as `<id>` in a directory of their own.
function cssIdOf(module: Module): string | null {
  const name = module.nameForCondition?.();
  if (!name || !CSS_ID.test(name)) return null;
  const id = decodeURIComponent(path.basename(name)).replace(/^_virtual_/, "");
  return path.isAbsolute(id) ? id : null;
}

// The entrypoints, by name, that a framework always loads with the named one.
export type LoadsWith = (entry: string, entries: ReadonlySet<string>) => readonly string[];

// What a framework such as Next.js tells the adapter about the compilers it creates, by compiler.
export const entryLoads: WeakMap<object, LoadsWith> = new WeakMap();

export interface WebpackSplitOptions {
  // The source module behind a kiln CSS module, for a CSS module this process never compiled.
  sourceOf: (cssId: string) => string | null;
  compiles: (id: string) => boolean;
  // Adds kiln's options to a persistent cache's version, so the cache never replays modules built with other ones.
  versionCache: (cache: unknown, salt: string) => void;
}

// Plans kiln's stylesheets from the chunk graph of a webpack or Rspack client build with `extract`, and appends each
// chunk's to the stylesheet the CSS pipeline emitted for it, so the bundler's own CSS loading and HTML links serve
// them. kiln's CSS modules stay in the module graph, where they tell the CSS pipeline which chunks need a stylesheet
// and tell frameworks such as Next.js which entries load which CSS, but hold only a placeholder. Kiln's rules skip the CSS
// pipeline's loaders, such as PostCSS; its minimiser still runs over them. The pipeline names a stylesheet before its
// content changes, so the build relies on `optimization.realContentHash` to rename it. Development builds keep a CSS
// module per source module.
export function webpackSplit(
  options: TransformOptions,
  { sourceOf, compiles, versionCache }: WebpackSplitOptions,
): {
  apply(compiler: object): void;
  planned(compiler: unknown): boolean;
  record(compiler: unknown, cssId: string, rules: Rules): void;
} {
  const states = new WeakMap<object, State | null>();
  const stateOf = (compiler: unknown) =>
    typeof compiler === "object" && compiler !== null ? (states.get(compiler) ?? null) : null;

  function decide(compiler: Compiler): { state: State | null; warning?: string } {
    const { mode, optimization } = compiler.options;
    if (!options.extract || mode === "development" || !compiler.platform?.web) return { state: null };
    if (!optimization.realContentHash) {
      return {
        state: null,
        warning:
          "[kiln] extract splits stylesheets by chunk only with optimization.realContentHash, which names each " +
          "stylesheet after the rules kiln adds to it; this build keeps a CSS module per source module.",
      };
    }
    return { state: { build: createBuild(), mode: splitMode(options) } };
  }

  function plan(compiler: Compiler, compilation: Compilation, state: State) {
    const { chunkGraph } = compilation;
    const relative = (file: string) => path.relative(compiler.context, file);
    const keyOf = (chunk: Chunk) => String(chunk.id);
    const groupKey = (group: ChunkGroup) => group.chunks.map(keyOf).sort().join("\0");
    const flatten = (modules: Iterable<Module>): Module[] =>
      [...modules].flatMap((module) => (module.modules ? flatten(module.modules) : [module]));

    const chunks = new Map<string, ChunkNode>();
    const files = new Map<string, string>();
    // Every kiln module with a CSS module behind it; another one is CSS that the pipeline turned into JS.
    const styled = new Set<string>();
    const scripted = new Set<string>();
    for (const chunk of compilation.chunks) {
      const key = keyOf(chunk);
      const modules = flatten(chunkGraph.getChunkModulesIterable(chunk));
      const groups = [...chunk.groupsIterable];
      const order = (module: Module) =>
        Math.min(...groups.map((group) => group.getModulePostOrderIndex(module) ?? Infinity));
      const css: [string, number][] = [];
      for (const module of modules) {
        const id = cssIdOf(module);
        if (!id) continue;
        if (module.type.startsWith("css")) {
          styled.add(id);
          css.push([id, order(module)]);
        } else scripted.add(id);
      }
      const dynamicImports = new Set<string>();
      const visit = (block: Block) => {
        const group = chunkGraph.getBlockChunkGroup(block);
        if (group) dynamicImports.add(groupKey(group));
        for (const inner of block.blocks ?? []) visit(inner);
      };
      for (const module of modules) for (const block of module.blocks ?? []) visit(block);
      const stylesheet = [...chunk.files].filter((file) => file.endsWith(".css")).sort()[0];
      if (stylesheet) files.set(key, stylesheet);
      chunks.set(key, {
        name:
          chunk.name ??
          modules
            .map((module) => relative(cssIdOf(module) ?? module.nameForCondition?.() ?? module.identifier()))
            .sort()
            .join("\n"),
        modules: css
          .sort(([, a], [, b]) => a - b)
          .map(([id]) => (state.build.moduleRules.has(id) ? id : (sourceOf(id) ?? id))),
        dynamicImports: [...dynamicImports],
        stylesheet: stylesheet !== undefined,
      });
    }

    const unstyled = [...scripted].filter((id) => !styled.has(id));
    if (unstyled.length > 0) {
      compilation.errors.push(
        new compiler.webpack.WebpackError(
          `[kiln] extract needs a CSS pipeline that emits stylesheets, such as mini-css-extract-plugin, Rspack's ` +
            `CssExtractRspackPlugin or native CSS, but it turned ${relative(unstyled[0]!)} into JavaScript.`,
        ),
      );
      return;
    }

    const loadsWith = entryLoads.get(compiler);
    const groups = new Map<string, GroupNode>();
    const named = new Map<string, string>();
    const all = [...compilation.chunkGroups];
    for (const group of all) if (group.isInitial() && group.name) named.set(group.name, groupKey(group));
    for (const group of all) {
      const initial = group.isInitial();
      const parents = initial ? group.getParents().filter((parent) => parent.isInitial()) : [];
      const framework = initial && group.name ? (loadsWith?.(group.name, new Set(named.keys())) ?? []) : [];
      const key = groupKey(group);
      // Groups with the same chunks, such as two dynamic imports of one module, load alike.
      const same = groups.get(key);
      groups.set(key, {
        name:
          same?.name ??
          group.name ??
          group.chunks
            .map((chunk) => chunks.get(keyOf(chunk))!.name)
            .sort()
            .join("\0"),
        chunks: group.chunks.map(keyOf),
        initial: initial || (same?.initial ?? false),
        loadsWith: [
          ...(same?.loadsWith ?? []),
          ...parents.map(groupKey),
          ...framework.flatMap((name) => (named.has(name) ? [named.get(name)!] : [])),
        ],
      });
    }

    const rules = rulesOf(state.build, options, compiles);
    let { sheets, unplaced } = planChunks(chunks, groups, rules, state.mode);
    if (unplaced.length > 0 && state.mode === "single") {
      compilation.warnings.push(
        new compiler.webpack.WebpackError(
          `[kiln] extract: { split: "single" } puts an entrypoint's rules in the stylesheet of one of its chunks, but ` +
            `the CSS pipeline emitted none for ${groups.get(unplaced[0]!)!.name}; this build splits them by chunk instead.`,
        ),
      );
      ({ sheets, unplaced } = planChunks(chunks, groups, rules, "chunks"));
    }
    if (unplaced.length > 0) {
      compilation.errors.push(
        new compiler.webpack.WebpackError(
          `[kiln] the CSS pipeline emitted no stylesheet for any chunk of ${groups.get(unplaced[0]!)!.name}, so its ` +
            `kiln rules have nowhere to go.`,
        ),
      );
    }
    const added = new Map<string, string>();
    for (const [key, classes] of sheets) {
      added.set(
        files.get(key)!,
        renderSheet(classes, (rule) => state.build.ruleText.get(rule)!),
      );
    }
    const { ConcatSource, ReplaceSource } = compiler.webpack.sources;
    const stylesheets = new Set([...compilation.chunks].flatMap((chunk) => [...chunk.files]));
    for (const file of stylesheets) {
      if (!file.endsWith(".css")) continue;
      const source = compilation.getAsset(file)?.source;
      if (!source) continue;
      const placeholders = [...String(source.source()).matchAll(PLACEHOLDER)];
      if (placeholders.length === 0 && !added.has(file)) continue;
      const stripped = new ReplaceSource(source);
      for (const { index, 0: match } of placeholders) stripped.replace(index, index + match.length - 1, "");
      compilation.updateAsset(file, new ConcatSource(stripped, added.get(file) ?? ""));
    }
  }

  return {
    apply(bundler) {
      const compiler = bundler as Compiler;
      compiler.hooks.afterEnvironment.tap("kiln", () => {
        const { state, warning } = decide(compiler);
        states.set(compiler, state);
        versionCache(compiler.options.cache, state ? "split" : "");
        if (warning) {
          compiler.hooks.thisCompilation.tap("kiln", (compilation) => {
            compilation.warnings.push(new compiler.webpack.WebpackError(warning));
          });
        }
      });
      compiler.hooks.thisCompilation.tap("kiln", (compilation) => {
        const state = states.get(compiler);
        if (!state) return;
        compilation.hooks.processAssets.tap(
          { name: "kiln", stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_PRE_PROCESS },
          () => plan(compiler, compilation, state),
        );
      });
    },
    planned: (compiler) => stateOf(compiler) !== null,
    record(compiler, cssId, rules) {
      const state = stateOf(compiler);
      if (state) record(state.build, cssId, rules);
    },
  };
}
