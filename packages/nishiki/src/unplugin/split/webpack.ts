import path from "node:path";

import { hash } from "../../core/utils.ts";
import { prefixOrder, type TransformOptions } from "../transform.ts";
import { compactNames, renameEdits, usesOf } from "../names.ts";
import { compact, createBuild, record, rulesOf, splitMode, textOf, type Build, type Rules } from "./build.ts";
import { inRank, plan, type Chunk as Unit, type Mode } from "./plan.ts";
import { renderSheet, usedOrder } from "./sheet.ts";

// A chunk of a webpack or Rspack build, which loads with every other chunk of the chunk group that a page or a dynamic
// import loads.
export interface ChunkNode {
  // Names the chunk the same way in every build.
  name: string;
  // nishiki's CSS modules in the chunk, in the order they run.
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
// sheet goes in the stylesheet of one of those, which the CSS pipeline emits for every chunk with a nishiki module.
// With `split: "single"` only entrypoints are units, and an entrypoint's sheet too goes in the stylesheet of a chunk only
// it loads, since any other would bring it along to other pages. The result lists the groups and shared chunks whose
// rules have no such stylesheet to go in.
export function planChunks(
  chunks: ReadonlyMap<string, ChunkNode>,
  groups: ReadonlyMap<string, GroupNode>,
  rulesOf: (module: string) => readonly string[],
  mode: Mode,
): {
  sheets: Map<string, string[]>;
  unplaced: Unplaced[];
  rank: ReadonlyMap<string, number>;
  // The chunks whose stylesheet may be the first nishiki sheet a page loads, and so must declare the layer order.
  leading: Set<string>;
} {
  const chunkKey = (key: string) => "chunk:" + key;
  const groupKey = (key: string) => "group:" + key;
  const memberships = new Map<string, string[]>();
  for (const [key, group] of groups) {
    for (const chunk of group.chunks) memberships.set(chunk, [...(memberships.get(chunk) ?? []), key]);
  }
  const shared = (chunk: string) => mode === "chunks" && memberships.get(chunk)!.length > 1;
  // The groups that load whenever a group does, such as the entrypoints it depends on.
  const shells = new Map<string, Set<string>>();
  const shellsOf = (key: string): Set<string> => {
    let found = shells.get(key);
    if (found) return found;
    found = new Set();
    shells.set(key, found);
    for (const other of groups.get(key)!.loadsWith) {
      if (!groups.has(other)) continue;
      found.add(other);
      for (const shell of shellsOf(other)) found.add(shell);
    }
    return found;
  };
  const common = <T>(sets: Set<T>[]) => sets.reduce((all, set) => new Set([...all].filter((item) => set.has(item))));

  const graph = new Map<string, Unit>();
  for (const [key, chunk] of chunks) {
    if (!memberships.has(key)) continue;
    const memberOf = memberships.get(key)!;
    const of = memberOf.map((group) => groups.get(group)!);
    // A shared chunk's sheet leaves out what loads whenever it does: the other shared chunks of every group it loads
    // in, and the groups those groups load with, whose sheets hold the rules of their own chunks. A chunk that one group
    // loads holds rules for that group's sheet, so it is no unit to leave out.
    const around = common(memberOf.map(shellsOf));
    const always = common(
      memberOf.map(
        (group) => new Set([group, ...shellsOf(group)].flatMap((member) => groups.get(member)!.chunks).filter(shared)),
      ),
    );
    graph.set(chunkKey(key), {
      modules: chunk.modules,
      imports: shared(key)
        ? [
            ...[...always].filter((other) => other !== key && chunks.has(other)).map(chunkKey),
            ...[...around].filter((group) => !memberOf.includes(group)).map(groupKey),
          ]
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
  const unplaced: Unplaced[] = [];
  const planned = plan(graph, rulesOf, mode);
  const leading = new Set<string>();
  const add = (chunk: string, classes: readonly string[], node: string) => {
    sheets.set(chunk, inRank([sheets.get(chunk) ?? [], classes], planned.rank));
    if (planned.leading.has(node)) leading.add(chunk);
  };
  for (const [node, classes] of planned.sheets) {
    if (node.startsWith("chunk:")) {
      const key = node.slice("chunk:".length);
      if (chunks.get(key)!.stylesheet) add(key, classes, node);
      else unplaced.push({ chunk: key });
      continue;
    }
    const key = node.slice("group:".length);
    const carrier = groups
      .get(key)!
      .chunks.filter((chunk) => chunks.get(chunk)?.stylesheet && memberships.get(chunk)!.length === 1)
      .sort((a, b) => compare(chunks.get(a)!.name, chunks.get(b)!.name) || compare(a, b))[0];
    if (carrier === undefined) unplaced.push({ group: key });
    else add(carrier, classes, node);
  }
  return { sheets, unplaced, rank: planned.rank, leading };
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// Merges the orders in which several chunk groups run the modules of a chunk they share, keeping every two modules in
// the order of each group that runs both, as mini-css-extract-plugin orders a chunk's CSS. Groups that disagree leave
// no such order, and then the first group's next module goes first.
export function mergeOrders(orders: readonly (readonly string[])[]): string[] {
  const listedIn = new Map<string, number[]>();
  orders.forEach((order, index) => {
    for (const item of order) listedIn.set(item, [...(listedIn.get(item) ?? []), index]);
  });
  const next = orders.map(() => 0);
  const placed = new Set<string>();
  const head = (index: number) => {
    const order = orders[index]!;
    while (next[index]! < order.length && placed.has(order[next[index]!]!)) next[index]!++;
    return order[next[index]!];
  };
  while (placed.size < listedIn.size) {
    const heads = orders.map((_, index) => head(index));
    const ready = heads.find(
      (item) => item !== undefined && listedIn.get(item)!.every((index) => heads[index] === item),
    );
    placed.add(ready ?? heads.find((item) => item !== undefined)!);
  }
  return [...placed];
}

// A chunk group, by key, none of whose chunks that only it loads has a stylesheet, or a shared chunk without one.
export type Unplaced = { group: string } | { chunk: string };

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

interface Asset {
  source: Source;
  info: { contenthash?: string | readonly string[] };
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
  getAsset(file: string): Asset | undefined;
  updateAsset(file: string, source: Source): void;
  deleteAsset(file: string): void;
}

interface Compiler {
  context: string;
  options: {
    mode?: string;
    optimization: { realContentHash?: boolean };
    cache?: unknown;
    experiments?: { css?: unknown };
    module: { rules?: unknown; generator?: Record<string, { exportsOnly?: boolean } | undefined> };
    plugins: readonly unknown[];
  };
  platform?: { web?: boolean | null };
  // Set on a child compiler, such as the one mini-css-extract-plugin evaluates CSS in without `experimentalUseImportModule`.
  parentCompilation?: { compiler: Compiler };
  hooks: {
    afterEnvironment: { tap(name: string, callback: () => void): void };
    thisCompilation: { tap(name: string, callback: (compilation: Compilation) => void): void };
  };
  webpack: {
    Compilation: { PROCESS_ASSETS_STAGE_PRE_PROCESS: number };
    // Rspack's only.
    CssExtractRspackPlugin?: abstract new (...args: never[]) => object;
    WebpackError: new (message: string) => Error;
    sources: {
      ConcatSource: new (...sources: (Source | string)[]) => Source;
      ReplaceSource: new (source: Source) => Source & { replace(start: number, end: number, text: string): void };
    };
  };
}

// Whether nishiki plans the build's sheets, decided once its options are complete.
interface State {
  build: Build;
  mode: Mode;
}

const CSS_ID = /\.nishiki\.css$/;
const PLACEHOLDER = /\/\*! nishiki:([0-9a-z]+) [0-9a-z]+ \*\/\s*/g;

// What a nishiki CSS module holds in a build whose sheets nishiki plans: a legal comment, which CSS loaders and Lightning CSS
// keep, naming the module and hashing the CSS it stands for. Not nothing: splitChunks' minSize never holds back a
// module of size 0, which would give nishiki's CSS modules chunks, and stylesheets, of their own, and the CSS pipeline
// would hash every such stylesheet alike. The CSS's hash keeps any name derived from the module's content, such as a
// `[chunkhash]`, following its rules.
export const placeholder = (cssId: string, css: string): string => `/*! nishiki:${hash(cssId)} ${hash(css)} */\n`;

// nishiki's CSS modules are never on disk, so unplugin names each after its id, URI-encoded: webpack's as `_virtual_<id>`,
// Rspack's as `<id>` in a directory of their own. A real `.nishiki.css` file's name need not be URI-encoded at all.
export function cssIdOfName(name: string | null | undefined): string | null {
  if (!name || !CSS_ID.test(name)) return null;
  let id: string;
  try {
    id = decodeURIComponent(path.basename(name)).replace(/^_virtual_/, "");
  } catch {
    return null;
  }
  return path.isAbsolute(id) ? id : null;
}

const cssIdOf = (module: Module): string | null => cssIdOfName(module.nameForCondition?.());

// Whether the build has a CSS pipeline that emits stylesheets: native CSS that keeps more than CSS's exports, which it
// does by default only for a target with a document, or an extract plugin. One that keeps CSS in JavaScript, as
// style-loader does, or keeps only its exports, as a server build does with css-loader's `exportOnlyLocals` or
// null-loader, has neither, and gets the rules of each CSS module in its place.
function emitsStylesheets(compiler: Compiler): boolean {
  const { experiments, module, plugins } = compiler.options;
  const { CssExtractRspackPlugin } = compiler.webpack;
  const generator = module.generator ?? {};
  const native = ["css", "css/auto", "css/module", "css/global"].some(
    (type) => !(generator[type]?.exportsOnly ?? generator.css?.exportsOnly ?? false),
  );
  const typesCSS = (rules: unknown): boolean =>
    Array.isArray(rules) &&
    rules.some(
      (rule: { type?: unknown; rules?: unknown; oneOf?: unknown } | null) =>
        typeof rule === "object" &&
        rule !== null &&
        ((typeof rule.type === "string" && rule.type.startsWith("css")) ||
          typesCSS(rule.rules) ||
          typesCSS(rule.oneOf)),
    );
  // mini-css-extract-plugin and the copy of it that Next.js compiles in name their loader on the class.
  const extracts = (plugin: unknown) => {
    if (CssExtractRspackPlugin && plugin instanceof CssExtractRspackPlugin) return true;
    const loader = (plugin as { constructor?: { loader?: unknown } } | null)?.constructor?.loader;
    return typeof loader === "string" && /[\\/]mini-css-extract-plugin[\\/]/.test(loader);
  };
  return ((Boolean(experiments?.css) || typesCSS(module.rules)) && native) || plugins.some(extracts);
}

// What a framework such as Next.js tells the adapter about a compiler it creates.
export interface Framework {
  // Whether a browser loads the build's stylesheets, which a web target alone does not tell for a server build.
  client: boolean;
  // The entrypoints, by name, that the framework always loads with the named one.
  loadsWith?: (entry: string, entries: ReadonlySet<string>) => readonly string[];
}

export const frameworks: WeakMap<object, Framework> = new WeakMap();

export interface WebpackSplitOptions {
  // The source module behind a nishiki CSS module, for a CSS module this process never compiled.
  sourceOf: (cssId: string) => string | null;
  compiles: (id: string) => boolean;
  // Adds nishiki's options to a persistent cache's version, so the cache never replays modules built with other ones.
  versionCache: (cache: unknown, salt: string) => void;
}

// Plans nishiki's stylesheets from the chunk graph of a webpack or Rspack client build with `extract` and a CSS pipeline
// that emits stylesheets, and appends each chunk's to the stylesheet the pipeline emitted for it, so the bundler's own
// CSS loading and HTML links serve them. nishiki's CSS modules stay in the module graph, where they tell the CSS pipeline which chunks need a stylesheet
// and tell frameworks such as Next.js which entries load which CSS, but hold only a placeholder. Nishiki's rules skip the CSS
// pipeline's loaders, such as PostCSS; its minimiser still runs over them. The pipeline names a stylesheet before its
// content changes, so the build relies on `optimization.realContentHash` to rename it, which it does only for a name
// with a `[contenthash]`; without one, each stylesheet gets the rules of its own CSS modules in their place instead.
// Development builds keep a CSS module per source module.
export function webpackSplit(
  options: TransformOptions,
  { sourceOf, compiles, versionCache }: WebpackSplitOptions,
): {
  apply(compiler: object): void;
  planned(compiler: unknown): boolean;
  record(compiler: unknown, cssId: string, rules: Rules): void;
} {
  const states = new WeakMap<object, State | null>();
  // A child compiler evaluates modules for its parent's build.
  const stateOf = (compiler: unknown) => {
    if (typeof compiler !== "object" || compiler === null) return null;
    let root = compiler as Compiler;
    while (root.parentCompilation) root = root.parentCompilation.compiler;
    return states.get(root) ?? null;
  };

  function decide(compiler: Compiler): { state: State | null; warning?: string } {
    const { mode, optimization } = compiler.options;
    const client = frameworks.get(compiler)?.client ?? compiler.platform?.web;
    if (!options.extract || mode === "development" || !client || !emitsStylesheets(compiler)) return { state: null };
    if (!optimization.realContentHash) {
      return {
        state: null,
        warning:
          "[nishiki] extract splits stylesheets by chunk only with optimization.realContentHash, which names each " +
          "stylesheet after the rules nishiki adds to it; this build keeps a CSS module per source module.",
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
    // The module whose rules a nishiki CSS module holds.
    const sourceKey = (id: string) => (state.build.moduleRules.has(id) ? id : (sourceOf(id) ?? id));
    const rules = rulesOf(state.build, options, compiles);
    const WebpackError = compiler.webpack.WebpackError;

    const chunks = new Map<string, ChunkNode>();
    const files = new Map<string, string>();
    // Every nishiki CSS module by the hash its placeholder names it with.
    const byHash = new Map<string, string>();
    // Every nishiki module with a CSS module behind it; another one is CSS that the pipeline turned into JS.
    const styled = new Set<string>();
    const scripted = new Set<string>();
    for (const chunk of compilation.chunks) {
      const key = keyOf(chunk);
      const modules = flatten(chunkGraph.getChunkModulesIterable(chunk));
      const css: [Module, string][] = [];
      for (const module of modules) {
        const id = cssIdOf(module);
        if (!id) continue;
        byHash.set(hash(id), id);
        if (module.type.startsWith("css")) {
          styled.add(id);
          css.push([module, id]);
        } else scripted.add(id);
      }
      // Each group that loads the chunk runs its modules in an order of its own, numbered on a scale of its own.
      const orders = [...chunk.groupsIterable]
        .sort((a, b) => compare(groupKey(a), groupKey(b)))
        .map((group) =>
          css
            .flatMap(([module, id]) => {
              const index = group.getModulePostOrderIndex(module);
              return index === null || index === undefined ? [] : [[id, index] as const];
            })
            .sort(([, a], [, b]) => a - b)
            .map(([id]) => id),
        );
      const unordered = css.map(([, id]) => id).filter((id) => !orders.some((order) => order.includes(id)));
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
        modules: [...mergeOrders(orders), ...unordered].map(sourceKey),
        dynamicImports: [...dynamicImports],
        stylesheet: stylesheet !== undefined,
      });
    }

    // A build whose pipeline emits stylesheets can still route nishiki's CSS elsewhere, such as through a rule of its own
    // with style-loader, which would then get a placeholder in place of the rules, whatever it makes of the placeholder.
    const unstyled = [...scripted].find((id) => !styled.has(id));
    if (unstyled !== undefined) {
      compilation.errors.push(
        new WebpackError(
          `[nishiki] extract adds nishiki's rules to the stylesheets that this build's CSS pipeline emits, but the pipeline ` +
            `turned ${relative(unstyled)} into JavaScript; give nishiki's CSS the loaders that extract the rest of the ` +
            `build's CSS, or leave the extract plugin out of a build whose CSS no browser loads.`,
        ),
      );
      return;
    }
    if (styled.size === 0) return;
    const { ConcatSource, ReplaceSource } = compiler.webpack.sources;

    // With `classNames: "compact"`, the rules get new names in the stylesheets and in every script that names them.
    const names = compact(options) ? compactNames(usesOf([...styled].map((id) => rules(sourceKey(id))))) : null;
    const textOfRule = textOf(state.build, names);
    const renameScripts = () => {
      if (!names) return;
      const scripts = new Set([...compilation.chunks].flatMap((chunk) => [...chunk.files]));
      for (const file of scripts) {
        if (!/\.[cm]?js$/.test(file)) continue;
        const source = compilation.getAsset(file)?.source;
        if (!source) continue;
        const edits = renameEdits(String(source.source()), file, names);
        if (edits.length === 0) continue;
        const renamed = new ReplaceSource(source);
        for (const { start, end, text } of edits) renamed.replace(start, end - 1, text);
        compilation.updateAsset(file, renamed);
      }
    };

    // Whether only pages link a stylesheet, never the CSS loader of a dynamic import, which has its name already.
    const stylesheets = new Map<string, boolean>();
    for (const chunk of compilation.chunks) {
      const initial = [...chunk.groupsIterable].every((group) => group.isInitial());
      for (const file of chunk.files) {
        if (file.endsWith(".css")) stylesheets.set(file, (stylesheets.get(file) ?? true) && initial);
      }
    }
    // Fills each placeholder in every stylesheet with what `fill` gives for its module, and appends what `added` gives
    // for the stylesheet.
    const rewrite = (fill: (id: string) => string, added: ReadonlyMap<string, string>) => {
      for (const [file, initial] of stylesheets) {
        const source = compilation.getAsset(file)?.source;
        if (!source) continue;
        const placeholders = [...String(source.source()).matchAll(PLACEHOLDER)];
        if (placeholders.length === 0 && !added.has(file)) continue;
        const filled = new ReplaceSource(source);
        for (const { index, 0: match, 1: named } of placeholders) {
          const id = byHash.get(named!);
          filled.replace(index, index + match.length - 1, id === undefined ? "" : fill(id));
        }
        const css = new ConcatSource(filled, added.get(file) ?? "");
        // A page need not wait for a stylesheet left empty.
        if (initial && String(css.source()).trim() === "") compilation.deleteAsset(file);
        else compilation.updateAsset(file, css);
      }
    };

    // realContentHash renames only a stylesheet whose name has a `[contenthash]`. Any other keeps its name while the
    // rules planned for it follow the rest of the build, so a cache would keep serving its old rules.
    const unhashed = [...stylesheets.keys()].find((file) => {
      const asset = compilation.getAsset(file);
      const contenthash = asset?.info.contenthash;
      return asset !== undefined && (contenthash === undefined || contenthash.length === 0);
    });
    if (unhashed !== undefined) {
      compilation.warnings.push(
        new WebpackError(
          `[nishiki] extract splits stylesheets by chunk only when optimization.realContentHash can rename each after ` +
            `the rules nishiki adds to it, which needs a [contenthash] in its name, but ${unhashed} has none; this build ` +
            `gives each stylesheet the rules of its own CSS modules.`,
        ),
      );
      rewrite((id) => {
        const texts = rules(sourceKey(id)).map(textOfRule);
        return texts.length === 0 ? "" : `${prefixOrder(texts)}\n${texts.join("\n")}\n`;
      }, new Map());
      renameScripts();
      return;
    }

    const loadsWith = frameworks.get(compiler)?.loadsWith;
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

    const where = (node: Unplaced) =>
      "chunk" in node
        ? `the shared chunk ${chunks.get(node.chunk)!.name.split("\n")[0]}`
        : `any chunk that only ${groups.get(node.group)!.name} loads`;
    let { sheets, unplaced, rank, leading } = planChunks(chunks, groups, rules, state.mode);
    if (unplaced.length > 0 && state.mode === "single") {
      compilation.warnings.push(
        new WebpackError(
          `[nishiki] extract: { split: "single" } puts an entrypoint's rules in the stylesheet of a chunk that only it ` +
            `loads, but the CSS pipeline emitted none for ${where(unplaced[0]!)}; this build splits them by chunk instead.`,
        ),
      );
      ({ sheets, unplaced, rank, leading } = planChunks(chunks, groups, rules, "chunks"));
    }
    if (unplaced.length > 0) {
      compilation.errors.push(
        new WebpackError(
          `[nishiki] the CSS pipeline emitted no stylesheet for ${where(unplaced[0]!)}, so its nishiki rules have nowhere to go.`,
        ),
      );
      return;
    }
    // Chunks whose CSS is alike can share one stylesheet, as with a `[contenthash]` name, which then holds every rule
    // planned for any of them, in the order they run.
    const planned = new Map<string, string[][]>();
    for (const [key, classes] of sheets) {
      const file = files.get(key)!;
      planned.set(file, [...(planned.get(file) ?? []), classes]);
    }
    // A stylesheet that may load first declares every layer the build's stylesheets use, in the order of the full table;
    // one that always loads after such a sheet leaves the statement out, as a Vite one does.
    const order = usedOrder([...sheets.values()].flatMap((classes) => classes.map(textOfRule)));
    const leads = new Set([...leading].map((key) => files.get(key)!));
    const added = new Map<string, string>();
    for (const [file, sheets] of planned) {
      added.set(file, renderSheet(inRank(sheets, rank), textOfRule, leads.has(file) ? order : null));
    }
    rewrite(() => "", added);
    renameScripts();
  }

  return {
    apply(bundler) {
      const compiler = bundler as Compiler;
      compiler.hooks.afterEnvironment.tap("nishiki", () => {
        const { state, warning } = decide(compiler);
        states.set(compiler, state);
        versionCache(compiler.options.cache, state ? "split" : "");
        if (warning) {
          compiler.hooks.thisCompilation.tap("nishiki", (compilation) => {
            compilation.warnings.push(new compiler.webpack.WebpackError(warning));
          });
        }
      });
      compiler.hooks.thisCompilation.tap("nishiki", (compilation) => {
        const state = states.get(compiler);
        if (!state) return;
        compilation.hooks.processAssets.tap(
          { name: "nishiki", stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_PRE_PROCESS },
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

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;

  describe("planChunks", () => {
    it("puts a group's rules in the same chunk whatever order its alike chunks come in", () => {
      const chunks = new Map<string, ChunkNode>(
        ["1", "2"].map((key) => [key, { name: "page", modules: [key], dynamicImports: [], stylesheet: true }]),
      );
      const carriers = [
        ["1", "2"],
        ["2", "1"],
      ].map((order) => {
        const groups = new Map<string, GroupNode>([
          ["main", { name: "main", chunks: order, initial: true, loadsWith: [] }],
        ]);
        return [...planChunks(chunks, groups, (module) => [`r${module}`], "chunks").sheets.keys()];
      });
      expect(carriers[0]).toEqual(["1"]);
      expect(carriers[1]).toEqual(carriers[0]);
    });
  });

  describe("cssIdOf", () => {
    const named = (name: string): Module => ({ type: "css", nameForCondition: () => name, identifier: () => name });

    it("decodes the id of nishiki's CSS module, and leaves a real .nishiki.css file alone", () => {
      const id = "/proj/src/a.tsx.nishiki.css";
      expect(cssIdOf(named(`/proj/node_modules/.virtual/_virtual_${encodeURIComponent(id)}`))).toBe(id);
      expect(cssIdOf(named("/proj/src/theme.nishiki.css"))).toBeNull();
      expect(cssIdOf(named("/proj/src/sale-50%.nishiki.css"))).toBeNull();
    });
  });

  describe("mergeOrders", () => {
    it("keeps the order of every list that holds two items, whatever its other items", () => {
      expect(mergeOrders([["first", "x", "y"], ["y"]])).toEqual(["first", "x", "y"]);
      expect(mergeOrders([["y"], ["first", "x", "y"]])).toEqual(["first", "x", "y"]);
      expect(
        mergeOrders([
          ["a", "c"],
          ["b", "c"],
        ]),
      ).toEqual(["a", "b", "c"]);
    });

    it("takes the first list's next item where the lists disagree", () => {
      expect(
        mergeOrders([
          ["x", "y"],
          ["y", "x"],
        ]),
      ).toEqual(["x", "y"]);
      expect(mergeOrders([])).toEqual([]);
    });
  });
}
