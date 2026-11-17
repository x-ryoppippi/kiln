import MagicString from "magic-string";
import { parseSync } from "oxc-parser";
import { layerStatement } from "../core/config.ts";
import { depthOf } from "../core/properties.ts";
import {
  compileInputs,
  createTable,
  entryOf,
  hash,
  layerName,
  noticeMessage,
  pack,
  rankOfLayer,
  type CompileContext,
  type ConditionOptions,
  type Packed,
  type RuleInput,
  type Table,
} from "../core/index.ts";

export interface TransformOptions {
  /** Module the runtime is imported from. */
  importSource?: string;
  /** Compile `css={{...}}` on host elements. */
  cssProp?: boolean;
  /**
   * Emit static rules as CSS instead of inserting them at runtime. In Vite client builds, Rollup and Rolldown builds and
   * production client builds of webpack, Rspack, Rsbuild and Next.js with webpack, `true` or `{ split: "chunks" }` gives
   * each entry and lazily loaded chunk that adds rules a stylesheet with only those rules; `{ split: "single" }`, or
   * Vite's `build.cssCodeSplit: false`, gives each entry one stylesheet with every rule it can reach. Rollup and Rolldown
   * chunks load their own stylesheets, listed per chunk in `.nishiki/manifest.json`, or `.nishiki/manifest.<format>.json` for
   * output that is not an ES module. webpack and Rspack get the rules in the stylesheets their CSS pipeline emits, which
   * needs `optimization.realContentHash` and `[contenthash]` in the stylesheets' names.
   * Other bundlers, and development builds, import a CSS module per source module, except Next.js with Turbopack, whose
   * loader cannot add CSS modules and inserts rules at runtime.
   */
  extract?: boolean | { split?: "chunks" | "single" };
  /**
   * How conditions rank against each other: a rule under a higher-ranked condition wins over one under a lower-ranked
   * condition, whatever order they load in. The runtime ranks with the same options in every environment the plugin
   * compiles for.
   */
  conditions?: ConditionOptions;
  /**
   * What to do when a module leaves a style object for nishiki's compiler to compile at runtime, which adds the full
   * runtime to a client bundle that would otherwise only load `@nishikijs/react/lean`: `"allow"` it, `"warn"` with the
   * first construct that needs it, or fail the build with an `"error"`. Only client builds, whose compiled modules load
   * the lean entries, report it.
   */
  runtime?: "allow" | "warn" | "error";
}

/** The first construct in a module that leaves a style object for nishiki's compiler to compile at runtime. */
export interface Fallback {
  line: number;
  column: number;
  construct: string;
}

export interface TransformResult {
  code: string;
  map: ReturnType<MagicString["generateMap"]>;
  /** Extracted CSS and the absolute id of the module it is imported from, when `extract` is on. */
  css?: { id: string; code: string };
  /** The extracted rules by class, when `extract` is on. */
  rules: [className: string, text: string][];
  /** Conditions missing from `conditions.order` and `!important` values, which nishiki's layers do not order. */
  warnings: string[];
  /** Why the module loads `@nishikijs/react/compiler`, when it does. */
  fallback?: Fallback;
}

/** The module that configures the runtime with the plugin's `conditions`, imported by every compiled module. */
export const CONFIG_ID = "virtual-nishiki-config";

const tables = new Map<string, Table>();
/** The ranks `options` configure. */
export function tableOf(options: TransformOptions): Table {
  const key = JSON.stringify(options.conditions ?? {});
  let table = tables.get(key);
  if (!table) tables.set(key, (table = createTable(options.conditions)));
  return table;
}

/** The runtime options of `conditions`, which the plugin hands to `configure`. */
export function runtimeConditions(conditions: ConditionOptions): ConditionOptions {
  const rest = { ...conditions };
  delete rest.strict;
  return rest;
}

// The call that hands the runtime the plugin's conditions and the number of ranks they make, so the runtime can declare
// its layers without ranking anything itself.
const configCall = (callee: string, options: TransformOptions): string =>
  `${callee}(${JSON.stringify(runtimeConditions(options.conditions ?? {}))},${tableOf(options).size});\n`;

/** The entry of `importSource` a module imports the runtime from. */
export const runtimeEntry = (importSource: string, lean: boolean): string =>
  lean ? importSource + "/lean" : importSource;

/** The source of the module that configures the runtime, for a build whose compiled modules are `lean` or not. */
export const configModule = (options: TransformOptions, lean: boolean): string =>
  `import { __c } from ${JSON.stringify(runtimeEntry(options.importSource ?? "@nishikijs/react", lean))};\n` +
  configCall("__c", options);

const RULE_LAYER = /^@layer nishiki\.(n[0-9a-z]+)/;
/** The rank of a compiled rule's text. */
export const rankOfRule = (text: string): number => rankOfLayer(RULE_LAYER.exec(text)![1]!);

/**
 * The statement declaring the layers up to the highest rank among `texts`. A prefix of the full order fits any other
 * prefix or the full order, in whichever order they reach the document, so modules can be concatenated in any order.
 */
export function prefixOrder(texts: Iterable<string>): string {
  let highest = 0;
  for (const text of texts) highest = Math.max(highest, rankOfRule(text));
  return layerStatement(Array.from({ length: highest + 1 }, (_, rank) => layerName(rank)));
}

/**
 * Extracted CSS lives in a virtual module named after its source, `<source>.nishiki.css`,
 * so any process can rebuild it from the source alone, without having run the transform.
 * A module id with a query, such as a code splitter's `?split=component`, is a different module
 * with its own rules, so its CSS module is `<source>.v<hash of the query>.nishiki.css`. A query that changes on every
 * request therefore leaves a new CSS module each time; Vite drops its HMR timestamp from module ids before transforms run.
 */
export const CSS_SUFFIX = ".nishiki.css";
const HELPER = "_nishiki$";
/** Text a module that refers to nishiki's `css`, `styled`, `configure` or the css prop has. */
export const QUICK_FILTER: RegExp = /\bcss\b|\bstyled\b|\bconfigure\b/;
const UNKNOWN = Symbol("unknown");

type Node = { type: string; start: number; end: number; [key: string]: any };

function unwrap(node: Node): Node {
  while (
    node.type === "TSAsExpression" ||
    node.type === "TSTypeAssertion" ||
    node.type === "TSSatisfiesExpression" ||
    node.type === "TSNonNullExpression" ||
    node.type === "ParenthesizedExpression"
  ) {
    node = node.expression;
  }
  return node;
}

function staticKey(property: Node): string | null {
  if (property.kind !== "init" || property.method) return null;
  return keyName(property);
}

/** Whether a property is a `__proto__: value` that sets the object's prototype instead of defining a key. */
function setsPrototype(property: Node): boolean {
  if (property.type !== "Property" || property.kind !== "init" || property.computed || property.shorthand) return false;
  const key = property.key;
  return key.type === "Identifier" ? key.name === "__proto__" : key.type === "Literal" && key.value === "__proto__";
}

/** The name of a property's key when it is known before runtime, also for an accessor or method. */
function keyName(property: Node): string | null {
  if (property.type !== "Property") return null;
  const key = property.key;
  if (!property.computed && key.type === "Identifier") return key.name;
  if (key.type === "Literal" && (typeof key.value === "string" || typeof key.value === "number")) {
    return String(key.value);
  }
  if (key.type === "TemplateLiteral" && key.expressions.length === 0) return key.quasis[0].value.cooked;
  return null;
}

/** Whether `resolve` skips a node's value as no style at all: a falsy literal or `undefined`. */
const skipped = (node: Node): boolean =>
  (node.type === "Literal" && !node.value && !node.regex) || (node.type === "Identifier" && node.name === "undefined");

/** Evaluate a node only if it is a literal style value; anything else is left to runtime. */
function staticValue(input: Node): unknown {
  const node = unwrap(input);
  switch (node.type) {
    case "Literal":
      return typeof node.value === "string" || typeof node.value === "number" || node.value === null
        ? node.value
        : UNKNOWN;
    case "TemplateLiteral":
      return node.expressions.length === 0 ? node.quasis[0].value.cooked : UNKNOWN;
    case "UnaryExpression":
      return node.operator === "-" && node.argument.type === "Literal" && typeof node.argument.value === "number"
        ? -node.argument.value
        : UNKNOWN;
    case "Identifier":
      return node.name === "undefined" ? undefined : UNKNOWN;
    case "ObjectExpression": {
      // Built the way the literal is at runtime, so `resolve` and `compileEntry` read the same keys in the same order.
      const result: Record<string, unknown> = {};
      for (const property of node.properties) {
        const key = staticKey(property);
        if (key === null) return UNKNOWN;
        const value = staticValue(property.value);
        if (value === UNKNOWN) return UNKNOWN;
        if (setsPrototype(property)) {
          if (typeof value === "object") Object.setPrototypeOf(result, value);
        } else {
          Object.defineProperty(result, key, { value, writable: true, enumerable: true, configurable: true });
        }
      }
      return result;
    }
    default:
      return UNKNOWN;
  }
}

// The object literals a style input made only of literals is, in the order `resolve` reads them: itself, or the items of
// a list and the lists in it, less those `resolve` skips. Null when any part of it is only known at runtime.
function literalStyles(input: Node): Node[] | null {
  const node = unwrap(input);
  if (skipped(node)) return [];
  if (node.type === "ObjectExpression") return staticValue(node) === UNKNOWN ? null : [node];
  if (node.type !== "ArrayExpression") return null;
  const styles: Node[] = [];
  for (const element of node.elements as (Node | null)[]) {
    // A hole reads as `undefined`, which `resolve` skips.
    if (element === null) continue;
    const nested = element.type === "SpreadElement" ? null : literalStyles(element);
    if (nested === null) return null;
    styles.push(...nested);
  }
  return styles;
}

// The rule inputs of an entry per merge key, as `compileInputs` gives them.
type Inputs = [key: string, inputs: RuleInput[]][];

interface CompiledObject {
  /** The entries of the whole object, when every key and value is known before runtime, which may be none. */
  entries: Inputs;
  /** Otherwise the values compiled in place, so the object JavaScript builds at runtime decides their order. */
  values: { node: Node; entries: Inputs }[];
  /** And the runtime values of properties, which compile at runtime in the layer the build ranks their key into. */
  ranked: { property: Node; key: string; layer: string }[];
  /** The first part left that only nishiki's compiler can compile at runtime. */
  raw: Leave | null;
}

// A construct that leaves a style object for nishiki's compiler to compile at runtime.
interface Leave {
  node: Node;
  construct: string;
}

// The construct a property that only the runtime compiler reads makes.
function rawConstruct(property: Node): string {
  if (property.type === "SpreadElement") return "a spread in a style object";
  if (property.kind === "set") return "a setter in a style object";
  if (property.method) return "a method in a style object";
  return "a computed key in a style object";
}

// One-word keys that name a CSS property. Any other lowercase word may be an element selector holding an object.
const WORDS = new Set(
  (
    "all animation appearance background border bottom caret clear clip color columns contain container content cursor " +
    "direction display fill filter flex float font gap grid height hyphens inset isolation left margin mask offset " +
    "opacity order outline overflow padding perspective position quotes resize right rotate scale stroke top transform " +
    "transition translate visibility width zoom"
  ).split(" "),
);
const PROPERTY = /^(?:--.+|-?[A-Za-z][a-z]*(?:[A-Z][a-z0-9]*)+)$/;

// The layer a property's runtime value goes in: no condition, at the property's depth.
const layerOfProperty = (key: string): string | null =>
  WORDS.has(key) || PROPERTY.test(key) ? layerName(0, key.startsWith("--") ? 0 : depthOf(key)) : null;

function compileObject(node: Node, context: CompileContext): CompiledObject | Leave {
  const value = staticValue(node);
  if (value !== UNKNOWN) {
    const styles = value as Record<string, unknown>;
    // Keyed by merge key the way `resolve` merges, so a key that only reads differently (`&:hover` for `:hover`) or
    // one selector of a list still overrides what came before it.
    const merged = new Map<string, Inputs[number]>();
    for (const key in styles) {
      for (const entry of compileInputs(key, styles[key], context)) {
        merged.delete(entry[0]);
        merged.set(entry[0], entry);
      }
    }
    return { entries: [...merged.values()], values: [], ranked: [], raw: null };
  }

  const properties: Node[] = node.properties;
  // A getter, in the literal or on a prototype only known at runtime, reads the object's values through `this`, so
  // compiling a value in place would change what it sees.
  const observed = properties.some(
    (property) => property.kind === "get" || (setsPrototype(property) && staticValue(property.value) === UNKNOWN),
  );
  if (observed) return { node, construct: "a getter or a prototype only known at runtime in a style object" };
  const keys = properties.map((property) => (setsPrototype(property) ? null : keyName(property)));
  const values: CompiledObject["values"] = [];
  const ranked: CompiledObject["ranked"] = [];
  let raw: Leave | null = null;
  properties.forEach((property, index) => {
    if (setsPrototype(property)) {
      // A prototype's keys reach `resolve` too, which only the compiler can compile.
      if (staticValue(property.value) !== null) raw ??= { node: property, construct: "a __proto__ in a style object" };
      return;
    }
    const key = staticKey(property);
    if (key === null) {
      raw ??= { node: property, construct: rawConstruct(property) };
      return;
    }
    // A key written again later is never read.
    if (keys.includes(key, index + 1)) return;
    const literal = property.shorthand ? UNKNOWN : staticValue(property.value);
    if (literal !== UNKNOWN) {
      values.push({ node: property.value, entries: compileInputs(key, literal, context) });
      return;
    }
    const layer = unwrap(property.value).type === "ObjectExpression" ? null : layerOfProperty(key);
    if (layer === null) {
      raw ??= {
        node: property,
        construct: `a runtime value under ${JSON.stringify(key)}, which is not a CSS property`,
      };
    } else ranked.push({ property, key, layer });
  });
  if (values.length + ranked.length > 0) return { entries: [], values, ranked, raw };
  return raw ?? { node, construct: "a style object" };
}

// JavaScript source for packed entries: JSON, but for numbers JSON has no literal for, such as `1e999`.
const literal = (value: unknown): string =>
  Array.isArray(value)
    ? "[" + value.map(literal).join(",") + "]"
    : typeof value === "number" && !Number.isFinite(value)
      ? String(value)
      : JSON.stringify(value);

function walk(node: unknown, visit: (node: Node) => boolean): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (!node || typeof node !== "object" || typeof (node as Node).type !== "string") return;
  if (visit(node as Node)) return;
  for (const key in node) {
    if (key === "type" || key === "start" || key === "end" || key === "range" || key === "loc") continue;
    const child = (node as Record<string, unknown>)[key];
    if (child && typeof child === "object") walk(child, visit);
  }
}

function bindingNames(pattern: Node | null): string[] {
  if (!pattern) return [];
  switch (pattern.type) {
    case "Identifier":
      return [pattern.name];
    case "ObjectPattern":
      return pattern.properties.flatMap((property: Node) =>
        bindingNames(property.type === "RestElement" ? property : property.value),
      );
    case "ArrayPattern":
      return pattern.elements.flatMap(bindingNames);
    case "AssignmentPattern":
      return bindingNames(pattern.left);
    case "RestElement":
      return bindingNames(pattern.argument);
    case "TSParameterProperty":
      return bindingNames(pattern.parameter);
    default:
      return [];
  }
}

const FUNCTIONS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

const BLOCK_SCOPES = new Set([
  "BlockStatement",
  "StaticBlock",
  "SwitchStatement",
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "TSModuleBlock",
]);

type Range = readonly [number, number];

/** Source ranges of the scopes in which a local declaration shadows one of `names`. */
function shadowedRanges(program: Node, names: ReadonlySet<string>): Range[] {
  return [...scopesDeclaring(program, names).values()].flat();
}

/** Source ranges of the scopes that declare each of `names`, the module's own included. */
function scopesDeclaring(program: Node, names: ReadonlySet<string>): Map<string, Range[]> {
  const ranges = new Map<string, Range[]>();
  const declare = (pattern: Node | null, scope: Node) => {
    for (const name of bindingNames(pattern)) {
      if (!names.has(name)) continue;
      if (!ranges.has(name)) ranges.set(name, []);
      ranges.get(name)!.push([scope.start, scope.end]);
    }
  };

  const scan = (node: unknown, functionScope: Node, blockScope: Node): void => {
    if (Array.isArray(node)) {
      for (const child of node) scan(child, functionScope, blockScope);
      return;
    }
    if (!node || typeof node !== "object" || typeof (node as Node).type !== "string") return;
    const current = node as Node;

    switch (current.type) {
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        if (current.id) declare(current.id, current.type === "FunctionDeclaration" ? blockScope : current);
        for (const param of current.params) declare(param, current);
        functionScope = blockScope = current;
        break;
      case "ClassDeclaration":
      case "ClassExpression":
        if (current.id) declare(current.id, current.type === "ClassDeclaration" ? blockScope : current);
        break;
      case "VariableDeclaration":
        for (const declarator of current.declarations) {
          declare(declarator.id, current.kind === "var" ? functionScope : blockScope);
        }
        break;
      case "CatchClause":
        declare(current.param, current);
        break;
      default:
        if (BLOCK_SCOPES.has(current.type)) blockScope = current;
    }

    for (const key in current) {
      if (key === "type" || key === "start" || key === "end" || key === "range" || key === "loc") continue;
      const child = current[key];
      if (child && typeof child === "object") scan(child, functionScope, blockScope);
    }
  };

  scan(program, program, program);
  return ranges;
}

const STYLE_EXPRESSIONS = new Set([
  "ObjectExpression",
  "ArrayExpression",
  "ConditionalExpression",
  "LogicalExpression",
]);

/** The initialisers of the module-level constants that hold a style expression, by name. */
function styleConstants(program: Node): Map<string, Node> {
  const constants = new Map<string, Node>();
  for (const statement of program.body as Node[]) {
    if (statement.type !== "VariableDeclaration" || statement.kind !== "const") continue;
    for (const { id, init } of statement.declarations as Node[]) {
      if (id.type === "Identifier" && init && STYLE_EXPRESSIONS.has(unwrap(init).type)) constants.set(id.name, init);
    }
  }
  return constants;
}

/**
 * Every identifier, JSX and type names included, that may read one of the module-level bindings `names`, with the
 * name it reads. Keys, member names, declared names and names under a declaration that shadows the binding are not.
 */
function referencesTo(program: Node, names: ReadonlySet<string>): Map<Node, string> {
  const shadowed = scopesDeclaring(program, names);
  for (const [name, ranges] of shadowed) {
    shadowed.set(
      name,
      ranges.filter(([start, end]) => start !== program.start || end !== program.end),
    );
  }
  const references = new Map<Node, string>();
  const read = (node: Node): boolean => {
    switch (node.type) {
      case "VariableDeclarator":
        if (node.id.type !== "Identifier") return false;
        walk(node.init, read);
        return true;
      case "MemberExpression":
      case "Property":
      case "MethodDefinition":
      case "PropertyDefinition":
        if (node.computed) return false;
        walk(node.type === "MemberExpression" ? node.object : node.value, read);
        return true;
      case "Identifier":
      case "JSXIdentifier":
        if (
          names.has(node.name) &&
          !shadowed.get(node.name)?.some(([start, end]) => start <= node.start && node.start < end)
        ) {
          references.set(node, node.name);
        }
        return true;
      default:
        return false;
    }
  };
  walk(program, read);
  return references;
}

function langOf(id: string): "js" | "jsx" | "ts" | "tsx" {
  const extension = /\.([cm]?[jt]sx?)$/.exec(id)?.[1] ?? "tsx";
  if (extension.endsWith("tsx")) return "tsx";
  if (extension.endsWith("ts")) return "ts";
  if (extension.endsWith("jsx")) return "jsx";
  return "jsx";
}

/**
 * What other than the calls the compiler handled can hand the runtime a style object: `css` or `styled` passed around
 * as a value, or an object with a `css` key, which reaches the css prop through a spread.
 */
function escapes(
  program: Node,
  names: ReadonlySet<string>,
  handled: ReadonlySet<Node>,
  shadowed: ReadonlyArray<readonly [number, number]>,
  cssProp: boolean,
): Leave | undefined {
  let found: Leave | undefined;
  const keyed = (key: Node) => (key.type === "Identifier" ? key.name : key.value) === "css";
  const visit = (node: Node): boolean => {
    switch (node.type) {
      case "ImportDeclaration":
        return true;
      case "MemberExpression":
        if (!node.computed) {
          walk(node.object, visit);
          return true;
        }
        return false;
      case "Property":
        if (cssProp && !node.computed && keyed(node.key)) found ??= { node, construct: "an object with a css key" };
        if (!node.computed && !node.shorthand) {
          walk(node.value, visit);
          return true;
        }
        return false;
      case "Identifier":
        if (
          names.has(node.name) &&
          !handled.has(node) &&
          !shadowed.some(([start, end]) => start <= node.start && node.start < end)
        ) {
          found ??= { node, construct: `${node.name} used as a value` };
        }
        return true;
      default:
        return found !== undefined;
    }
  };
  walk(program, visit);
  return found;
}

// The tag goes in the basename rather than a query, which not every bundler keeps on a CSS id.
export function cssModuleId(id: string): string {
  const filename = id.replace(/[?#].*$/, "");
  const variant = id.slice(filename.length);
  return filename + (variant ? ".v" + hash(variant) : "") + CSS_SUFFIX;
}

export function transform(code: string, id: string, options: TransformOptions = {}): TransformResult | null {
  return compileModule(code, id, options, { cssImport: true, configImport: false, lean: false });
}

export interface ModuleOptions {
  // Planned Vite, Rollup and Rolldown builds turn this off to leave the CSS import out and emit the rules themselves.
  cssImport: boolean;
  // Import the plugin's config module rather than pass the conditions along in every module, as a loader has to.
  configImport: boolean;
  // Point the module at the import source's lean entries, as a client build does, and load the compiler only where a
  // style falls back to it. Otherwise the module keeps the full entries, which load the compiler themselves.
  lean: boolean;
}

// The entries a module can import from nishiki, by the subpath their lean counterparts add `/lean` before.
const ENTRY_SUBPATHS = new Set(["", "/jsx-runtime", "/jsx-dev-runtime"]);
const JSX_IMPORT_SOURCE = /@jsxImportSource\s+([^\s*]+)/;
const HASHBANG = /^#!.*/;

// The import source a `@jsxImportSource` pragma in one of a module's comments names, and where it starts.
function jsxImportSourceOf(
  code: string,
  comments: readonly { start: number; end: number }[],
): { source: string; start: number } | undefined {
  for (const comment of comments) {
    const match = JSX_IMPORT_SOURCE.exec(code.slice(comment.start, comment.end));
    if (match) return { source: match[1]!, start: comment.start + match.index + match[0].length - match[1]!.length };
  }
  return undefined;
}

export function compileModule(
  code: string,
  id: string,
  options: TransformOptions,
  { cssImport, configImport, lean }: ModuleOptions,
): TransformResult | null {
  const { importSource = "@nishikijs/react", cssProp = true } = options;
  const filename = id.replace(/[?#].*$/, "");
  const styles = QUICK_FILTER.test(code);
  // The css prop assumes JSX compiles against the import source, so with it a module's JSX takes the lean JSX runtime.
  // JSX can only be in a JavaScript or TSX module.
  const jsx = lean && cssProp && langOf(filename) !== "ts";
  const imports = lean && code.includes(importSource);
  if (!styles && !jsx && !imports) return null;

  let program: Node | undefined;
  let comments: readonly { start: number; end: number }[] = [];
  if (styles || imports || (jsx && code.includes("@jsxImportSource"))) {
    const parsed = parseSync(filename, code, { lang: langOf(filename) });
    if (parsed.errors.length > 0) return null;
    program = parsed.program as unknown as Node;
    comments = parsed.comments;
  }
  const s = new MagicString(code);
  // A module that imports the import source may hand its namespace or default export on without naming `css`, which
  // only compileStyles tells apart from a module that needs no compiler.
  const compiled = styles || imports ? compileStyles(filename, program!, s, options) : null;
  const extracted = compiled?.extracted ?? new Map<string, string>();
  const hoisted = compiled?.hoisted ?? new Map<string, string>();
  const replaced = compiled?.replaced ?? 0;
  const fallback = compiled?.fallback;

  // A module that leaves styles to runtime configures it as well, since it may compile them before any other does.
  const configured = options.conditions !== undefined && (replaced > 0 || fallback !== undefined);
  const compiler = lean && fallback !== undefined;
  const runtime = runtimeEntry(importSource, lean);

  let retargeted = false;
  if (lean && program) {
    for (const statement of program.body as Node[]) {
      if (statement.type !== "ImportDeclaration" || statement.importKind === "type") continue;
      if (compiled?.unused.has(statement)) continue;
      // A side-effect import asks for the full entry; nothing else in the module needs it.
      if (statement.specifiers.length === 0) continue;
      const source: string = statement.source.value;
      const subpath = source.startsWith(importSource) ? source.slice(importSource.length) : null;
      if (subpath === null || !ENTRY_SUBPATHS.has(subpath)) continue;
      s.overwrite(statement.source.start, statement.source.end, JSON.stringify(runtime + subpath));
      retargeted = true;
    }
  }
  let pragma = "";
  if (jsx) {
    const own = jsxImportSourceOf(code, comments);
    // Where no element can take a css prop any more, nishiki's JSX runtime would only hand each element on to React's.
    if (!own) pragma = `/** @jsxImportSource ${compiled?.cssProps === false ? "react" : runtime} */\n`;
    else if (own.source === importSource) {
      s.overwrite(own.start, own.start + own.source.length, runtime);
      retargeted = true;
    }
  }
  if (replaced === 0 && !configured && !compiler && !retargeted && !pragma) return null;

  let header = compiler ? `import ${JSON.stringify(importSource + "/compiler")};\n` : "";
  const helpers = [
    // Extracted entries are class names alone, which need none of the code that formats rules.
    [...hoisted.keys()].some((call) => call.startsWith(HELPER + "(")) &&
      `${options.extract ? "__x" : "__k"} as ${HELPER}`,
    compiled?.valued && `__v as ${HELPER}v`,
    compiled?.joined && `__j as ${HELPER}j`,
    compiled?.folded && `__n as ${HELPER}n`,
  ].filter(Boolean);
  if (helpers.length > 0) header += `import { ${helpers.join(", ")} } from ${JSON.stringify(runtime)};\n`;
  if (configured) {
    header += configImport
      ? `import ${JSON.stringify(CONFIG_ID)};\n`
      : `import { __c as ${HELPER}c } from ${JSON.stringify(runtime)};\n` + configCall(HELPER + "c", options);
  }
  let cssResult: TransformResult["css"];
  if (options.extract && cssImport && extracted.size > 0) {
    const cssId = cssModuleId(id);
    header += `import ${JSON.stringify("./" + /[^/\\]*$/.exec(cssId)![0])};\n`;
    cssResult = {
      id: cssId,
      code: prefixOrder(extracted.values()) + "\n" + [...extracted.values()].join("\n") + "\n",
    };
  }
  for (const [call, name] of hoisted) header += `const ${name} = ${call};\n`;

  const hashbang = HASHBANG.exec(code)?.[0].length ?? 0;
  if (header) {
    const directives = ((program?.body ?? []) as Node[]).filter((statement) => typeof statement.directive === "string");
    const last = directives.at(-1);
    if (last) s.appendLeft(last.end, "\n" + header);
    else if (hashbang) s.appendLeft(hashbang, "\n" + header);
    else s.prepend(header);
  }
  // SWC, which Next.js and Rspack compile JSX with, misses the pragma after a directive followed by an import, and oxc
  // misses it after an import: only the start of the module works for every JSX compiler. Directives may follow comments.
  if (pragma && hashbang) s.prependLeft(hashbang, "\n" + pragma.trimEnd());
  else if (pragma) s.prepend(pragma);

  return {
    code: s.toString(),
    map: s.generateMap({ source: filename, includeContent: true, hires: "boundary" }),
    css: cssResult,
    rules: [...extracted],
    warnings: [...(compiled?.warnings ?? [])],
    fallback: fallback && { ...position(code, fallback.node.start), construct: fallback.construct },
  };
}

interface CompiledStyles {
  // The style expressions compiled in place.
  replaced: number;
  // The hoisted constants by the call that builds them.
  hoisted: Map<string, string>;
  // Whether a runtime value of a property is ranked at build time, which needs the `__v` helper.
  valued: boolean;
  // Whether an element's own class names are joined with compiled ones at runtime, which needs the `__j` helper.
  joined: boolean;
  // Whether a `css()` call folded into a constant, which needs the `__n` component.
  folded: boolean;
  // The import declarations removed, all of whose bindings were css, which every call folded away.
  unused: ReadonlySet<Node>;
  // Whether an element may still take a css prop: through a css attribute left in place, or a spread.
  cssProps: boolean;
  fallback: Leave | undefined;
  extracted: Map<string, string>;
  warnings: Set<string>;
}

function compileStyles(
  filename: string,
  program: Node,
  s: MagicString,
  options: TransformOptions,
): CompiledStyles | null {
  const { importSource = "@nishikijs/react", cssProp = true } = options;
  const extract = Boolean(options.extract);

  const cssNames = new Set<string>();
  const styledNames = new Set<string>();
  // The first construct by which the module may hand the runtime a style object to compile.
  let fallback: Leave | undefined;
  const leave = (node: Node, construct: string) => {
    if (!fallback || node.start < fallback.node.start) fallback = { node, construct };
  };
  for (const statement of program.body as Node[]) {
    if (statement.type !== "ImportDeclaration" || statement.source.value !== importSource) continue;
    for (const specifier of statement.specifiers) {
      if (specifier.type !== "ImportSpecifier") {
        leave(specifier, `a ${specifier.type === "ImportNamespaceSpecifier" ? "namespace" : "default"} import`);
        continue;
      }
      const name = specifier.imported.name ?? specifier.imported.value;
      if (name === "css") cssNames.add(specifier.local.name);
      if (name === "styled") styledNames.add(specifier.local.name);
      // The lean entries' `configure` only ranks conditions once the compiler is loaded.
      if (name === "configure") leave(specifier, "configure()");
    }
  }
  if (!cssProp && cssNames.size === 0 && styledNames.size === 0 && !fallback) return null;

  const shadowed =
    cssNames.size + styledNames.size > 0 ? shadowedRanges(program, new Set([...cssNames, ...styledNames])) : [];
  const importedName = (node: Node) =>
    shadowed.some(([start, end]) => start <= node.start && node.start < end) ? null : node.name;

  const table = tableOf(options);
  const warnings = new Set<string>();
  const context: CompileContext = {
    table,
    notify(notice) {
      const message = noticeMessage(notice) + ".";
      if ("atRule" in notice || (options.conditions?.strict && "unranked" in notice)) {
        throw new Error(`[nishiki] ${filename}: ${message}`);
      }
      warnings.add("[nishiki] " + message);
    },
  };
  const extracted = new Map<string, string>();
  const hoisted = new Map<string, string>();
  let replaced = 0;

  // The class names of an entry whose rules move to a stylesheet.
  const extractEntry = ([key, inputs]: Inputs[number]): string => {
    const [, className, rules] = entryOf(key, inputs);
    for (const [ruleClass, text] of rules) extracted.set(ruleClass, text);
    return className;
  };

  // Compiled styles are hoisted so every render passes the same object, which `resolve` caches by identity. Extracted
  // rules leave only their class names behind; the others travel as the inputs the runtime formats them from, which
  // are far smaller than the rules and their class names.
  const hoist = (compiledEntries: Inputs): string => {
    const entries = compiledEntries.map((entry): Packed | [key: string, className?: string] => {
      if (!extract) return pack(...entry);
      const className = extractEntry(entry);
      return className ? [entry[0], className] : [entry[0]];
    });
    const call = HELPER + "(" + literal(entries) + ")";
    let name = hoisted.get(call);
    if (!name) hoisted.set(call, (name = HELPER + hoisted.size));
    return name;
  };

  const handled = new Set<Node>();
  let valued = false;
  let joined = false;
  // The callee of each css() call folded into a constant.
  const folded = new Set<Node>();
  // The opening element of each JSX attribute.
  const owners = new Map<Node, Node>();
  // The css props compiled to class names.
  const classNamed = new Set<Node>();

  // The entries of literal style objects merged per key as `resolve` merges them, a key set again moving to the end.
  const mergeLiterals = (styles: readonly Node[]): Inputs => {
    const merged = new Map<string, Inputs[number]>();
    for (const style of styles) {
      for (const entry of (compileObject(style, context) as CompiledObject).entries) {
        merged.delete(entry[0]);
        merged.set(entry[0], entry);
      }
    }
    return [...merged.values()];
  };

  // With extract, `css()` of nothing but literal styles returns class names whose rules are all in a stylesheet, and a
  // component that renders nothing, so the call folds into one constant.
  const foldCss = (call: Node): boolean => {
    const styles: Node[] = [];
    for (const argument of call.arguments as Node[]) {
      const literal = argument.type === "SpreadElement" ? null : literalStyles(argument);
      if (literal === null) return false;
      styles.push(...literal);
    }
    const className = mergeLiterals(styles).map(extractEntry).filter(Boolean).join(" ");
    const value = `[${JSON.stringify(className)}, ${HELPER}n]`;
    let name = hoisted.get(value);
    if (!name) hoisted.set(value, (name = HELPER + hoisted.size));
    s.overwrite(call.start, call.end, name);
    folded.add(call.callee);
    replaced++;
    return true;
  };

  // With extract, a static css prop on a host element leaves nothing for the runtime to do but add its class names to
  // the element's own, so it compiles to them. A spread may hold a className or a css prop of its own, and another tag
  // may be a component, which reads the css prop itself, so those keep the css prop.
  const compileToClassName = (attribute: Node): boolean => {
    const element = owners.get(attribute);
    const expression = unwrap(attribute.value.expression);
    if (element?.name.type !== "JSXIdentifier" || !/^[a-z]/.test(element.name.name) || element.name.name === "this") {
      return false;
    }
    // `css={null}` and `css={undefined}` stay on the element, so only an object or a list compiles away.
    if (expression.type !== "ObjectExpression" && expression.type !== "ArrayExpression") return false;
    const styles = literalStyles(expression);
    if (styles === null) return false;
    const attributes: Node[] = element.attributes;
    if (attributes.some((other) => other.type === "JSXSpreadAttribute")) return false;
    const named = (name: string) =>
      attributes.filter((other) => other.name.type === "JSXIdentifier" && other.name.name === name);
    const [own, ...more] = named("className");
    if (named("css").length > 1 || more.length > 0) return false;
    if (own && own.value?.type !== "Literal" && own.value?.type !== "JSXExpressionContainer") return false;

    const className = mergeLiterals(styles).map(extractEntry).filter(Boolean).join(" ");
    replaced++;
    const last = attributes.at(-1)!;
    if (className && !own && last === attribute) {
      s.overwrite(attribute.start, attribute.end, `className="${className}"`);
      return true;
    }
    let start = attribute.start;
    while (/\s/.test(s.original[start - 1]!)) start--;
    s.remove(start, attribute.end);
    if (!className) return true;
    // The css prop appends className after every other prop.
    if (!own) s.appendLeft(last.end, ` className="${className}"`);
    else {
      const value = own.value;
      if (value.type === "Literal") {
        // Appended inside the quotes, so the JSX transform decodes the element's own class names as before.
        if (value.raw.length === 2) s.overwrite(value.start, value.end, `"${className}"`);
        else s.appendLeft(value.end - 1, " " + className);
      } else {
        s.prependLeft(value.expression.start, `${HELPER}j(`);
        s.appendRight(value.expression.end, `, "${className}")`);
        joined = true;
      }
    }
    return true;
  };

  // A module-level constant that holds a style expression and is only ever read as style input compiles in place, so
  // reading it needs no compiler. Which constants qualify is only known once every reference has been seen, so the walk
  // skips their initialisers and records the references it reads as style input.
  const constants = styleConstants(program);
  const references = constants.size > 0 ? referencesTo(program, new Set(constants.keys())) : new Map<Node, string>();
  const pending = new Set(constants.values());
  const styleReferences = new Set<Node>();
  // Whether each constant compiled in place, once decided.
  const compiledConstants = new Map<string, boolean>();
  const replaceObject = (target: Node, node: Node): void => {
    const result = compileObject(node, context);
    if ("construct" in result) {
      leave(result.node, result.construct);
      walk(target, visit);
      return;
    }

    if (result.values.length + result.ranked.length === 0) {
      s.overwrite(target.start, target.end, hoist(result.entries));
    } else {
      const compiledValues = new Set<Node>();
      for (const { node: value, entries } of result.values) {
        s.overwrite(value.start, value.end, hoist(entries));
        compiledValues.add(value);
      }
      for (const property of node.properties) {
        if (!compiledValues.has(property.value)) walk(property, visit);
      }
      for (const { property, key, layer } of result.ranked) {
        const args = [JSON.stringify(key), JSON.stringify(layer)];
        if (property.shorthand) {
          s.appendLeft(property.end, `: ${HELPER}v(${args[0]}, ${property.value.name}, ${args[1]})`);
        } else {
          s.prependLeft(property.value.start, `${HELPER}v(${args[0]}, `);
          s.appendRight(property.value.end, `, ${args[1]})`);
        }
      }
      if (result.ranked.length > 0) valued = true;
      if (result.raw) leave(result.raw.node, result.raw.construct);
    }
    replaced++;
  };

  // Compile what `resolve` can read as style input at `target`: the object literals a list, a conditional or a logical
  // expression can evaluate to, each in its own place.
  const replace = (target: Node): void => {
    const node = unwrap(target);
    switch (node.type) {
      case "ObjectExpression":
        return replaceObject(target, node);
      case "ArrayExpression":
        for (const element of node.elements as (Node | null)[]) {
          if (element?.type === "SpreadElement") {
            leave(element, "a spread in a list of styles");
            walk(element, visit);
          } else if (element) replace(element);
        }
        return;
      case "ConditionalExpression":
        walk(node.test, visit);
        replace(node.consequent);
        replace(node.alternate);
        return;
      case "LogicalExpression":
        // `resolve` skips a falsy input, so the left side of `&&` only reaches it as no style at all.
        if (node.operator === "&&") walk(node.left, visit);
        else replace(node.left);
        replace(node.right);
        return;
    }
    if (skipped(node)) return;
    const constant = references.get(node);
    if (constant !== undefined && compiledConstants.get(constant) !== false) {
      if (!compiledConstants.has(constant)) styleReferences.add(node);
      return;
    }
    leave(node, "a style that is not an object literal");
    walk(target, visit);
  };

  // A function passed to `styled` hands `resolve` what it returns: its expression body, or the argument of each return
  // statement outside the functions it nests.
  const replaceResolver = (resolver: Node): void => {
    if (resolver.async || resolver.generator) {
      leave(resolver, "an async or generator styled resolver");
      walk(resolver, visit);
      return;
    }
    for (const param of resolver.params) walk(param, visit);
    if (resolver.body.type !== "BlockStatement") return replace(resolver.body);
    const returns = (node: Node): boolean => {
      if (FUNCTIONS.has(node.type)) {
        walk(node, visit);
        return true;
      }
      if (node.type !== "ReturnStatement") return visit(node);
      if (node.argument) replace(node.argument);
      return true;
    };
    walk(resolver.body, returns);
  };

  const visit = (node: Node): boolean => {
    if (pending.has(node)) return true;
    if (node.type === "CallExpression" && node.callee.type === "Identifier") {
      const args: Node[] = node.arguments;
      const name = importedName(node.callee);
      const compiledArgs =
        name === null ? [] : cssNames.has(name) ? args : styledNames.has(name) ? args.slice(1, 2) : [];
      if (compiledArgs.length > 0) {
        handled.add(node.callee);
        if (extract && cssNames.has(name!) && foldCss(node)) return true;
        if (args.length > 2 && styledNames.has(name!)) leave(args[2]!, "a third argument to styled");
        for (const arg of args) {
          if (!compiledArgs.includes(arg)) walk(arg, visit);
          else if (styledNames.has(name!) && FUNCTIONS.has(unwrap(arg).type)) replaceResolver(unwrap(arg));
          else replace(arg);
        }
        return true;
      }
    }
    if (node.type === "JSXOpeningElement") for (const attribute of node.attributes) owners.set(attribute, node);
    if (cssProp && node.type === "JSXAttribute" && node.name.type === "JSXIdentifier" && node.name.name === "css") {
      if (node.value?.type === "JSXExpressionContainer") {
        if (extract && compileToClassName(node)) classNamed.add(node);
        else replace(node.value.expression);
        return true;
      }
      leave(node, "a css prop that is not an expression");
    }
    return false;
  };
  walk(program, visit);
  // Later constants first, so a constant read only by another one's style expression knows whether that one compiled.
  const reads = Map.groupBy(references, ([, name]) => name);
  for (const [name, init] of [...constants].reverse()) {
    pending.delete(init);
    const read = (reads.get(name) ?? []).map(([node]) => node);
    const compiled = read.length > 0 && read.every((node) => styleReferences.has(node));
    compiledConstants.set(name, compiled);
    if (compiled) {
      replace(init);
      continue;
    }
    walk(init, visit);
    for (const node of read) if (styleReferences.has(node)) leave(node, "a style that is not an object literal");
  }
  const escaped = escapes(program, new Set([...cssNames, ...styledNames]), handled, shadowed, cssProp);
  if (escaped) leave(escaped.node, escaped.construct);
  // An import of css that every call folded away is left unused, which bundlers warn about; the helpers the module
  // imports instead load the same entry.
  const unused = new Set<Node>();
  if (folded.size > 0) {
    const imports = (program.body as Node[]).filter((statement) => statement.type === "ImportDeclaration");
    const inImport = (node: Node) =>
      imports.some((statement) => statement.start <= node.start && node.end <= statement.end);
    const live = new Set(
      [...referencesTo(program, cssNames)]
        .filter(([node]) => !folded.has(node) && !inImport(node))
        .map(([, name]) => name),
    );
    for (const statement of imports) {
      if (statement.source.value !== importSource) continue;
      const specifiers: Node[] = statement.specifiers;
      const dropped = specifiers.filter(
        (specifier) =>
          specifier.type === "ImportSpecifier" && cssNames.has(specifier.local.name) && !live.has(specifier.local.name),
      );
      if (dropped.length === 0) continue;
      if (dropped.length === specifiers.length) {
        s.remove(statement.start, statement.end);
        unused.add(statement);
        continue;
      }
      for (const specifier of dropped) {
        const index = specifiers.indexOf(specifier);
        const next = specifiers[index + 1];
        if (next) s.remove(specifier.start, next.start);
        else s.remove(specifiers[index - 1]!.end, specifier.end);
      }
    }
  }

  let cssProps = false;
  walk(program, (node) => {
    if (node.type === "JSXSpreadAttribute") cssProps = true;
    else if (node.type === "JSXAttribute" && node.name.type === "JSXIdentifier" && node.name.name === "css") {
      cssProps ||= !classNamed.has(node);
    }
    return cssProps;
  });
  return {
    replaced,
    hoisted,
    valued,
    joined,
    folded: folded.size > 0,
    unused,
    cssProps,
    fallback,
    extracted,
    warnings,
  };
}

// The 1-based line and column of an offset, as editors and bundlers print them.
function position(code: string, offset: number): { line: number; column: number } {
  const before = code.slice(0, offset);
  const lineStart = before.lastIndexOf("\n") + 1;
  return { line: before.split("\n").length, column: offset - lineStart + 1 };
}

/** The message that reports why a module loads nishiki's runtime compiler. */
export const fallbackMessage = (id: string, { line, column, construct }: Fallback): string =>
  `[nishiki] ${id.replace(/[?#].*$/, "")}:${line}:${column}: ${construct} needs nishiki's compiler at runtime, which ` +
  `adds the full runtime to the client bundle.`;

/** Warn about, or fail on, a module that falls back to the runtime compiler in a lean build, as `runtime` asks. */
export function reportFallback(
  id: string,
  result: TransformResult | null,
  runtime: TransformOptions["runtime"],
  warn: (message: string) => void,
): void {
  if (!result?.fallback || !runtime || runtime === "allow") return;
  const message = fallbackMessage(id, result.fallback);
  if (runtime === "error") throw new Error(message);
  warn(message);
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;
  const { readFile } = await import("node:fs/promises");
  const { evaluate } = await import("../../test/unplugin/helpers/evaluate.ts");
  const { compileEntry } = await import("../core/index.ts");
  // The packed entries the plugin emits for the given keys and values, in order.
  const packed = (...styles: [key: string, value: unknown][]) =>
    JSON.stringify(
      styles.flatMap(([key, value]) =>
        compileInputs(key, value, { table: tableOf({}) }).map(([merged, inputs]) => pack(merged, inputs)),
      ),
    );

  const compile = (code: string, id = "file.tsx", options = {}) => transform(code, id, options)?.code;
  // As a client build compiles a module: only then does a module that falls back load the compiler itself.
  const lean = (code: string, id = "file.tsx", options: TransformOptions = {}) =>
    compileModule(code, id, options, { cssImport: true, configImport: false, lean: true });
  const PRAGMA = `/** @jsxImportSource @nishikijs/react/lean */\n`;
  const REACT_PRAGMA = `/** @jsxImportSource react */\n`;

  describe("lean builds", () => {
    it("point the module's imports of nishiki's entries at their lean counterparts", () => {
      const result = lean(
        `import { css, Styles } from '@nishikijs/react'\n` +
          `import { jsx } from "@nishikijs/react/jsx-runtime"\n` +
          `import { jsxDEV } from "@nishikijs/react/jsx-dev-runtime"\n` +
          `import type { CSSObject } from "@nishikijs/react"\n` +
          `import "@nishikijs/react"\n` +
          `import { createTable } from "@nishikijs/react/core"\n` +
          `export * from "@nishikijs/react"\n` +
          `export const a = css({ color: 'red' })`,
        "a.ts",
      )!;
      expect(result.code).toBe(
        `import { __k as _nishiki$ } from "@nishikijs/react/lean";\n` +
          `const _nishiki$0 = _nishiki$(${packed(["color", "red"])});\n` +
          `import { css, Styles } from "@nishikijs/react/lean"\n` +
          `import { jsx } from "@nishikijs/react/lean/jsx-runtime"\n` +
          `import { jsxDEV } from "@nishikijs/react/lean/jsx-dev-runtime"\n` +
          `import type { CSSObject } from "@nishikijs/react"\n` +
          `import "@nishikijs/react"\n` +
          `import { createTable } from "@nishikijs/react/core"\n` +
          `export * from "@nishikijs/react"\n` +
          `export const a = css(_nishiki$0)`,
      );
      expect(result.fallback).toBeUndefined();
    });

    it("load the compiler where a module hands nishiki's namespace or default export on, whether it names css or not", () => {
      for (const code of [
        `import * as n from "@nishikijs/react";\nexport { n };`,
        `import n from "@nishikijs/react";\nexport default n;`,
      ]) {
        expect(lean(code, "a.ts")?.code, code).toBe(
          `import "@nishikijs/react/compiler";\n` + code.replace(`"@nishikijs/react"`, `"@nishikijs/react/lean"`),
        );
      }
    });

    it("point a module without styles at the lean entries too", () => {
      expect(lean(`import { Styles } from '@nishikijs/react'\nexport const S = Styles`, "a.ts")?.code).toBe(
        `import { Styles } from "@nishikijs/react/lean"\nexport const S = Styles`,
      );
      expect(lean(`export const a = 1`, "a.ts")).toBeNull();
    });

    it("compile JSX against the lean JSX runtime, with a pragma before any directive", () => {
      expect(lean(`export const A = () => <div />`)?.code).toBe(PRAGMA + `export const A = () => <div />`);
      expect(lean(`'use client'\nexport const A = () => <div css={{ color: 'red' }} />`)?.code).toMatch(
        new RegExp(
          "^" + RegExp.escape(PRAGMA + `'use client'\nimport { __k as _nishiki$ } from "@nishikijs/react/lean";\n`),
        ),
      );
      for (const id of ["a.js", "a.jsx", "a.mjs", "a.cjs", "a.tsx", "a.tsx?v=1"]) {
        expect(lean(`export const a = 1`, id)?.code, id).toBe(PRAGMA + `export const a = 1`);
      }
      for (const id of ["a.ts", "a.mts", "a.cts"]) expect(lean(`export const a = 1`, id), id).toBeNull();
      expect(lean(`#!/usr/bin/env node\nexport const A = () => <div css={{ color: 'red' }} />`)?.code).toMatch(
        new RegExp(
          "^" +
            RegExp.escape(`#!/usr/bin/env node\n${PRAGMA}import { __k as _nishiki$ } from "@nishikijs/react/lean";\n`),
        ),
      );
      expect(lean(`export const A = () => <div />`, "a.tsx", { cssProp: false })).toBeNull();
    });

    it("compile JSX against React's JSX runtime where no element can take a css prop any more", () => {
      const pragmaOf = (code: string, options: TransformOptions = {}) =>
        /^\/\*\* @jsxImportSource (\S+) \*\//.exec(lean(code, "a.tsx", options)!.code)?.[1];
      const styled = `import { styled } from '@nishikijs/react'\nconst B = styled('b', { color: 'red' })\n`;
      expect(pragmaOf(`export const A = () => <div css={{ color: 'red' }} />`, { extract: true })).toBe("react");
      expect(pragmaOf(styled + `export const A = () => <B className="x" />`)).toBe("react");
      // A css prop left in place, also on a tag that may hold a string at runtime, or a spread that may carry one,
      // still needs nishiki's JSX runtime.
      for (const code of [
        `export const A = () => <B css={{ color: 'red' }} />`,
        `export const A = (p) => <div {...p} css={{ color: 'red' }} />`,
        `export const A = (p) => <><i css={{ color: 'red' }} /><b {...p} /></>`,
        `export const A = (p) => <div css={{ color: p.c }} />`,
        `export const A = () => <div css="color: red" />`,
      ]) {
        expect(pragmaOf(code, { extract: true }), code).toBe("@nishikijs/react/lean");
      }
      expect(pragmaOf(`export const A = () => <div css={{ color: 'red' }} />`)).toBe("@nishikijs/react/lean");
      expect(pragmaOf(styled + `export const A = (p) => <B {...p} />`)).toBe("@nishikijs/react/lean");
    });

    it("keep a module's own JSX import source, unless it names nishiki's full entries", () => {
      expect(lean(`/** @jsxImportSource preact */\nexport const A = () => <div />`)).toBeNull();
      expect(lean(`/** @jsxImportSource @nishikijs/react */\nexport const A = () => <div />`)?.code).toBe(
        PRAGMA + `export const A = () => <div />`,
      );
      expect(lean(`// @jsxImportSource @nishikijs/react/lean\nexport const A = () => <div />`)).toBeNull();
    });

    it("read a JSX import source only from a comment, not from a string that mentions one", () => {
      // A module that names nishiki is compiled, which finds no css prop in it.
      for (const [source, pragma] of [
        ["preact", PRAGMA],
        ["@nishikijs/react", REACT_PRAGMA],
      ]) {
        const code = `export const note = "@jsxImportSource ${source}"\nexport const A = () => <div />`;
        expect(lean(code)?.code, source).toBe(pragma + code);
      }
      const template = "export const A = () => <div title={`/* @jsxImportSource preact */`} />";
      expect(lean(template)?.code).toBe(PRAGMA + template);
    });

    it("load the compiler only where a style object reaches the runtime", () => {
      expect(lean(`export const A = (p) => <div css={p.styles} />`)?.code).toBe(
        PRAGMA + `import "@nishikijs/react/compiler";\nexport const A = (p) => <div css={p.styles} />`,
      );
      expect(lean(`import { css } from 'acme'\ncss(s)`, "a.ts", { importSource: "acme" })?.code).toBe(
        `import "acme/compiler";\nimport { css } from "acme/lean"\ncss(s)`,
      );
      expect(lean(`import { css } from '@nishikijs/react'\ncss({ color: 'red' })`, "a.ts")?.code).not.toContain(
        "/compiler",
      );
    });

    it("leave a module to the full entries outside a lean build, which load the compiler themselves", () => {
      expect(compile(`export const A = (p) => <div css={p.styles} />`)).toBeUndefined();
      expect(compile(`import { css } from '@nishikijs/react'\ncss({ color: 'red' })`)).toMatch(
        /^import \{ __k as _nishiki\$ \} from "@nishikijs\/react";\n[^]*\nimport \{ css \} from '@nishikijs\/react'\n/,
      );
    });

    it("configure the runtime through the lean entry", () => {
      const conditions = { breakpoints: ["600px"] };
      expect(configModule({ conditions }, true)).toMatch(/^import \{ __c \} from "@nishikijs\/react\/lean";\n__c\(/);
      expect(configModule({ conditions }, false)).toMatch(/^import \{ __c \} from "@nishikijs\/react";\n__c\(/);
      expect(configModule({ conditions, importSource: "acme" }, true)).toMatch(/^import \{ __c \} from "acme\/lean";/);
    });
  });

  describe("at-rules that cannot hold style rules", () => {
    it("fail the build with the file that uses them, in literal and runtime-compiled objects alike", () => {
      for (const code of [
        `export const A = () => <div css={{ "@keyframes spin": { from: { opacity: 0 } } }} />`,
        `import { css } from '@nishikijs/react'\nexport const a = (x) => css({ ...x, "@font-face": { fontFamily: "Inter" } })`,
      ]) {
        expect(() => transform(code, "/src/a.tsx", {}), code).toThrow(
          /^\[nishiki\] \/src\/a\.tsx: "@(keyframes spin|font-face)" cannot hold styles/,
        );
      }
    });
  });

  describe("runtime configuration", () => {
    const conditions = { breakpoints: ["600px"], strict: false };
    const configured = (code: string, configImport: boolean, lean = false) =>
      compileModule(code, "/src/a.tsx", { conditions }, { cssImport: true, configImport, lean })?.code;

    it("configures the runtime in a module that only leaves styles to it", () => {
      const call = `_nishiki$c({"breakpoints":["600px"]},${tableOf({ conditions }).size});\n`;
      for (const code of [
        `export const A = (p) => <div css={p.styles} />`,
        `import { css } from '@nishikijs/react'\nexport const a = (s) => css(s)`,
        `import { styled } from '@nishikijs/react'\nexport const B = styled('b', (p) => p.styles)`,
      ]) {
        expect(configured(code, true), code).toBe(`import "${CONFIG_ID}";\n` + code);
        expect(configured(code, false), code).toBe(
          `import { __c as _nishiki$c } from "@nishikijs/react";\n` + call + code,
        );
        const leanCode = code.replace(`'@nishikijs/react'`, `"@nishikijs/react/lean"`);
        const pragma = code.includes("css={") ? PRAGMA : REACT_PRAGMA;
        expect(configured(code, true, true), code).toBe(
          pragma + `import "@nishikijs/react/compiler";\nimport "${CONFIG_ID}";\n` + leanCode,
        );
        expect(configured(code, false, true), code).toBe(
          pragma +
            `import "@nishikijs/react/compiler";\nimport { __c as _nishiki$c } from "@nishikijs/react/lean";\n` +
            call +
            leanCode,
        );
      }
    });

    it("leaves a module that cannot reach the runtime alone", () => {
      expect(configured(`export const a = 1`, true)).toBeUndefined();
      expect(
        configured(`import { css } from '@nishikijs/react'\nexport const s = css({ color: 'red' })`, true),
      ).toContain(`import "${CONFIG_ID}";`);
    });
  });

  describe("what reaches the runtime", () => {
    const leaves = (code: string) => lean(code)?.code.includes(`import "@nishikijs/react/compiler";`) ?? false;

    it("is nothing in a module whose styles are all literal, or that has none", () => {
      expect(leaves(`export const x = <div id="a" />`)).toBe(false);
      expect(leaves(`export const A = () => <div css={{ color: 'red' }} />`)).toBe(false);
      expect(
        leaves(`import { css, styled } from '@nishikijs/react'\ncss({ margin: 0 })\nstyled('a', { color: 'red' })`),
      ).toBe(false);
      expect(leaves(`import { css } from '@nishikijs/react'\nconst f = (css) => css.x\nobj.css`)).toBe(false);
    });

    it("is a style object in a module that leaves one to runtime, or passes one along", () => {
      for (const code of [
        `export const A = (p) => <div css={p.styles} />`,
        `export const A = (p) => <div css={{ span: p.c }} />`,
        `export const A = (p) => <div css={{ ":hover": p.c }} />`,
        `export const A = (p) => <div css={{ color: { x: p.c } }} />`,
        `export const A = () => <div css="color: red" />`,
        `export const p = { css: { color: 'red' } }`,
        `export const p = { "css": { color: 'red' } }`,
        `import { css } from '@nishikijs/react'\nexport const a = (s) => css(s)`,
        `import { css } from '@nishikijs/react'\nexport const a = css`,
        `import { css } from '@nishikijs/react'\nexport { css }`,
        `import * as nishiki from '@nishikijs/react'\nnishiki.css({ color: 'red' })`,
        `import { styled } from '@nishikijs/react'\nstyled('a', (p) => p.styles)`,
        `import { configure } from '@nishikijs/react'\nconfigure({ breakpoints: ['600px'] })`,
      ]) {
        expect(leaves(code), code).toBe(true);
      }
    });

    it("reports the first construct that leaves a style to runtime, where it is", () => {
      const fallback = (code: string) => lean(code, "/src/a.tsx")?.fallback;
      const imports = `import { css, styled } from '@nishikijs/react'\n`;
      const cases: [code: string, construct: string][] = [
        [`<div css={p.styles} />`, "a style that is not an object literal"],
        [`<div css="color: red" />`, "a css prop that is not an expression"],
        [`css({ ...base, color: 'red' })`, "a spread in a style object"],
        [`css({ [key]: 1 })`, "a computed key in a style object"],
        [`css({ color() {} })`, "a method in a style object"],
        [`css({ set color(v) {} })`, "a setter in a style object"],
        [`css({ get color() { return 'red' } })`, "a getter or a prototype only known at runtime in a style object"],
        [`css({ __proto__: base, margin: 0 })`, "a getter or a prototype only known at runtime in a style object"],
        [`css({ __proto__: { color: 'red' }, margin: m })`, "a __proto__ in a style object"],
        [`css({ ":hover": { color: tone } })`, `a runtime value under ":hover", which is not a CSS property`],
        [`styled('a', { color: 'red' }, x)`, "a third argument to styled"],
        [`styled('a', resolver)`, "a style that is not an object literal"],
        [`styled('a', async (p) => ({ color: p.$c }))`, "an async or generator styled resolver"],
        [`export const c = css`, "css used as a value"],
        [`export const p = { css: { color: 'red' } }`, "an object with a css key"],
      ];
      for (const [code, construct] of cases) {
        expect(fallback(imports + code), code).toEqual({ line: 2, column: expect.any(Number), construct });
      }
      expect(fallback(`import { configure } from '@nishikijs/react'\nconfigure({})`)).toEqual({
        line: 1,
        column: 10,
        construct: "configure()",
      });
      expect(fallback(`import * as k from '@nishikijs/react'\nk.css({})`)).toEqual({
        line: 1,
        column: 8,
        construct: "a namespace import",
      });
      expect(fallback(imports + `css({ color: 'red' })\nexport const A = (p) => <i css={p.a} css={p.b} />`)).toEqual({
        line: 3,
        column: 33,
        construct: "a style that is not an object literal",
      });
      expect(fallback(imports + `css({ color: 'red', margin: m })`)).toBeUndefined();
    });

    it("names where a module leaves styles to runtime in its message", () => {
      expect(fallbackMessage("/src/a.tsx?v=1", { line: 2, column: 5, construct: "a spread in a style object" })).toBe(
        "[nishiki] /src/a.tsx:2:5: a spread in a style object needs nishiki's compiler at runtime, which adds the " +
          "full runtime to the client bundle.",
      );
    });

    it("leaves a module it cannot parse to the bundler, which reports the error", () => {
      expect(compile(`export const x = <div css={{ color: 'red' }} `)).toBeUndefined();
    });
  });

  describe("transform", () => {
    it("compiles a static css prop to what its rules are made from, and imports the helper", () => {
      const output = compile(
        `export const A = () => <div css={{ color: 'red', margin: 0, "@media print": { "& span": { color: 'blue' } } }} />`,
      )!;
      expect(output).toMatch(/^import \{ __k as _nishiki\$ \} from "@nishikijs\/react";\nconst _nishiki\$0 = /);
      const [[, , [[, print]]]] = compileEntry("@media print", { "& span": { color: "blue" } }) as any;
      const layer = /^@layer nishiki\.([^{]+)/.exec(print)![1];
      expect(output).toContain(
        `const _nishiki$0 = _nishiki$([["color",["red","n0"]],["margin",[0,"n0.a.a.a"]],` +
          `["@media print",["blue","${layer}","color","& span","@media print"]]]);`,
      );
      expect(output).toContain("css={_nishiki$0}");
    });

    it("leaves styles that are not object literals alone", () => {
      expect(compile(`export const A = (p) => <div css={p.styles} />`)).toBeUndefined();
    });

    it("ranks the runtime value of a property at build time, so it needs no compiler", () => {
      const output = compile(
        `export const A = (p) => <div css={{ color: p.color, marginInline: p.m, "--a": 1 + p.a }} />`,
      )!;
      expect(output).toBe(
        `import { __v as _nishiki$v } from "@nishikijs/react";\nexport const A = (p) => <div css={{ color: _nishiki$v("color", p.color, "n0"), ` +
          `marginInline: _nishiki$v("marginInline", p.m, "n0.a.a"), "--a": _nishiki$v("--a", 1 + p.a, "n0") }} />`,
      );
      expect(compile(`import { css } from '@nishikijs/react'\ncss({ color, ...{} })`)).toContain(
        `css({ color: _nishiki$v("color", color, "n0"), ...{} })`,
      );
    });

    it("compiles the static values of an object with a runtime part in place", () => {
      const output = compile(
        `import { css } from '@nishikijs/react'\ncss({ a: x, ...rest, color: 'red', margin: m })`,
      )!;
      expect(output).toContain(`const _nishiki$0 = _nishiki$(${packed(["color", "red"])});`);
      expect(output).toContain(
        'css({ a: x, ...rest, color: _nishiki$0, margin: _nishiki$v("margin", m, "n0.a.a.a") })',
      );
    });

    it("only compiles css and styled imported from the runtime", () => {
      expect(compile(`import { css } from 'other'\ncss({ color: 'red' })`, "a.ts", { cssProp: false })).toBeUndefined();
      const output = compile(
        `import { styled as s } from '@nishikijs/react'\nexport const B = s('button', { color: 'red' })`,
        "a.ts",
      )!;
      expect(output).toContain(`s('button', _nishiki$0)`);
    });

    it("compiles through TypeScript wrappers", () => {
      const output = compile(`import { css } from '@nishikijs/react'\ncss({ color: 'red' } as const)`, "a.ts")!;
      expect(output).toContain("css(_nishiki$0)");
    });

    it("inserts the import after directives", () => {
      const output = compile(`'use client'\nexport const A = () => <div css={{ color: 'red' }} />`)!;
      expect(output.startsWith(`'use client'\nimport { __k as _nishiki$ }`)).toBe(true);
    });

    it("moves rules into a CSS module when extracting, leaving class names behind", () => {
      const result = transform(
        `export const A = () => <><Box css={{ color: 'red' }} /><div css={{ color: 'red' }} /></>`,
        "/src/a.tsx",
        { extract: true },
      )!;
      expect(result.code).toContain(`import "./a.tsx.nishiki.css";`);
      expect(result.code).toMatch(/^import \{ __x as _nishiki\$ \} from "@nishikijs\/react";\n/);
      expect(result.css!.id).toBe("/src/a.tsx.nishiki.css");
      expect(result.code).toMatch(/const _nishiki\$0 = _nishiki\$\(\[\["color","n[0-9a-z]+"\]\]\);/);
      expect(result.code).toMatch(/<div className="n[0-9a-z]+" \/>/);
      expect(result.css!.code).toMatch(
        /^@layer nishiki\{@layer n0;\}\n@layer nishiki\.n0\{\.n[0-9a-z]+\{color:red\}\}\n$/,
      );
    });

    it("folds css() of literal styles into a constant with extract, dropping an import left unused", () => {
      const extracted = (code: string) =>
        compileModule(code, "/src/a.ts", { extract: true }, { cssImport: false, configImport: false, lean: true })!
          .code;
      const [, className] = compileEntry("color", "blue")[0]!;
      expect(
        extracted(
          `import { css } from '@nishikijs/react'\nexport const a = () => css({ color: 'red' }, null, { color: 'blue' })`,
        ),
      ).toBe(
        `import { __n as _nishiki$n } from "@nishikijs/react/lean";\nconst _nishiki$0 = ["${className}", _nishiki$n];\n\n` +
          `export const a = () => _nishiki$0`,
      );
      expect(
        extracted(`import { styled, css, Styles } from '@nishikijs/react'\nexport const a = css({ color: 'red' })`),
      ).toContain(`\nimport { styled, Styles } from "@nishikijs/react/lean"\n`);
      expect(
        extracted(`import { Styles, css } from '@nishikijs/react'\nexport const a = css({ color: 'red' })`),
      ).toContain(`\nimport { Styles } from "@nishikijs/react/lean"\n`);
      // A call with a runtime part, or any other use of css, keeps the import.
      for (const code of [`css({ color: 'red' }, p)`, `css({ color: p })`, `[css({ color: 'red' }), css]`]) {
        expect(extracted(`import { css } from '@nishikijs/react'\nexport const a = (p) => ${code}`), code).toContain(
          `import { css } from "@nishikijs/react/lean"`,
        );
      }
      expect(transform(`import { css } from '@nishikijs/react'\ncss({ color: 'red' })`, "a.ts")!.code).toContain(
        "css(_nishiki$0)",
      );
    });

    it("returns the extracted rules, and leaves the CSS import to a caller that emits them itself", () => {
      const source = `export const A = () => <Box css={{ color: 'red' }} />`;
      const [, className, rules] = compileEntry("color", "red")[0]!;
      const imported = transform(source, "/src/a.tsx", { extract: { split: "single" } })!;
      expect(imported.rules).toEqual(rules);
      const planned = compileModule(
        source,
        "/src/a.tsx",
        { extract: true },
        { cssImport: false, configImport: true, lean: false },
      )!;
      expect(planned.css).toBeUndefined();
      expect(planned.rules).toEqual(rules);
      expect(planned.code).not.toContain(".nishiki.css");
      expect(planned.code).toContain(JSON.stringify(["color", className]));
      expect(transform(source, "/src/a.tsx")!.rules).toEqual([]);
    });

    it("gives each query variant of a module its own CSS module", () => {
      const source = `export const A = () => <div css={{ color: 'red' }} />`;
      const plain = transform(source, "/src/a.tsx", { extract: true })!;
      const split = transform(source, "/src/a.tsx?split=component", { extract: true })!;
      const other = transform(source, "/src/a.tsx?split=loader", { extract: true })!;
      expect(split.css!.id).toMatch(/^\/src\/a\.tsx\.v[0-9a-z]+\.nishiki\.css$/);
      expect(new Set([plain.css!.id, split.css!.id, other.css!.id]).size).toBe(3);
      expect(split.code).toContain(`import "./${split.css!.id.slice("/src/".length)}";`);
      expect(cssModuleId("/src/a.tsx#x")).not.toBe(plain.css!.id);
    });

    it("tags a query variant deterministically", () => {
      expect(cssModuleId("/src/a.tsx?split=component")).toBe(cssModuleId("/src/a.tsx?split=component"));
      expect(cssModuleId("/src/a.tsx?split=component")).toBe(`/src/a.tsx.v${hash("?split=component")}.nishiki.css`);
    });

    it("hoists identical static styles into one module-level constant", () => {
      const output = compile(
        `export const A = () => <><i css={{ color: 'red' }} /><b css={{ color: 'red' }} /><u css={{ margin: 0 }} /></>`,
      )!;
      expect(output.match(/^const _nishiki\$\d+ = /gm)).toHaveLength(2);
      expect(output).toContain("<i css={_nishiki$0} /><b css={_nishiki$0} /><u css={_nishiki$1} />");
    });

    it("compiles the objects in a list, a conditional or a logical expression, each in its place", () => {
      const result = (code: string) => transform(code, "a.tsx")!;
      const list = result(
        `export const A = (p) => <div css={[{ color: 'red' }, [p.on && { margin: 0 }], p.off ? { padding: p.x } : null]} />`,
      );
      expect(list.code).toContain(
        `css={[_nishiki$0, [p.on && _nishiki$1], p.off ? { padding: _nishiki$v("padding", p.x, "n0.a.a.a") } : null]}`,
      );
      expect(list.fallback).toBeUndefined();

      const logical = result(
        `import { css } from '@nishikijs/react'\ncss(p.a || { color: 'red' }, p.b ?? { margin: 0 }, p.c && {}, undefined)`,
      );
      expect(logical.code).toContain(`css(p.a || _nishiki$0, p.b ?? _nishiki$1, p.c && _nishiki$2, undefined)`);
      expect(logical.code).toContain(`const _nishiki$2 = _nishiki$([]);`);
      expect(logical.fallback).toMatchObject({
        line: 2,
        column: 5,
        construct: "a style that is not an object literal",
      });
    });

    it("leaves what a list or a conditional can evaluate to besides an object literal to runtime", () => {
      const fallback = (code: string) => transform(code, "a.tsx")?.fallback?.construct;
      expect(fallback(`export const A = (p) => <div css={[base, p.on && { color: 'red' }]} />`)).toBe(
        "a style that is not an object literal",
      );
      expect(fallback(`export const A = (p) => <div css={[...p.list, { color: 'red' }]} />`)).toBe(
        "a spread in a list of styles",
      );
      expect(fallback(`export const A = (p) => <div css={p.on ? { color: 'red' } : p.css} />`)).toBe(
        "a style that is not an object literal",
      );
      expect(fallback(`export const A = (p) => <div css={p.on ? { color: 'red' } : 0} />`)).toBeUndefined();
    });

    it("compiles what a styled resolver written in place returns", () => {
      const result = transform(
        `import { css, styled } from '@nishikijs/react'\n` +
          `export const A = styled('a', ({ $tone }) => ({ color: $tone, padding: 1 }))\n` +
          `export const B = styled('b', function ({ $on, $x = css({ margin: 0 }) }) {\n` +
          `  if ($on) return { color: 'red' }\n` +
          `  const f = () => ({ margin: 0 })\n` +
          `  return f.length ? null : [$x[0] && { margin: 0 }]\n` +
          `})`,
        "a.js",
      )!;
      expect(result.fallback).toBeUndefined();
      expect(result.code).toContain(
        `styled('a', ({ $tone }) => ({ color: _nishiki$v("color", $tone, "n0"), padding: _nishiki$0 }))`,
      );
      expect(result.code).toContain(`$x = css(_nishiki$1)`);
      expect(result.code).toContain(`if ($on) return _nishiki$2\n  const f = () => ({ margin: 0 })\n`);
      expect(result.code).toContain(`return f.length ? null : [$x[0] && _nishiki$1]`);
    });

    it("leaves a styled resolver that returns anything else to runtime", () => {
      const fallback = (resolver: string) =>
        lean(`import { styled } from '@nishikijs/react'\nstyled('a', ${resolver})`, "a.js")?.fallback?.construct;
      expect(fallback(`(p) => p.styles`)).toBe("a style that is not an object literal");
      expect(fallback(`function () { if (x) return { color: 'red' }; return base }`)).toBe(
        "a style that is not an object literal",
      );
      expect(fallback(`(p) => ({ ...p.base, color: 'red' })`)).toBe("a spread in a style object");
      expect(fallback(`(p) => ({ [p.key]: 1 })`)).toBe("a computed key in a style object");
      expect(fallback(`function* () { yield { color: 'red' } }`)).toBe("an async or generator styled resolver");
    });

    it("compiles a module-level constant only read as style input in place", () => {
      const result = transform(
        `import { css, styled } from '@nishikijs/react'\n` +
          `const base = { color: 'red' }\n` +
          `const active = { margin: 0 } as const\n` +
          `const both = [base, { padding: 1 }]\n` +
          `export const A = (p) => <div css={[base, p.on && active]} />\n` +
          `export const B = styled('b', (p) => p.on ? both : base)\n` +
          `export const c = css(both)`,
        "a.tsx",
      )!;
      expect(result.fallback).toBeUndefined();
      expect(result.code).toMatch(
        /\nconst base = _nishiki\$\d+\nconst active = _nishiki\$\d+\nconst both = \[base, _nishiki\$\d+\]\n/,
      );
      expect(result.code).toContain(`css={[base, p.on && active]}`);
      expect(result.code).toContain(`styled('b', (p) => p.on ? both : base)`);
    });

    it("leaves a constant read any other way, or exported, as it is", () => {
      const result = (code: string) =>
        lean(`import { css } from '@nishikijs/react'\nconst base = { color: 'red' }\n` + code, "a.tsx")!;
      for (const code of [
        `css(base)\nexport const tone = base.color`,
        `css(base)\nexport { base }`,
        `css(base, { ...base })`,
        `css(base)\nconst other = [base]\nf(other)`,
        `css(base)\nexport const A = () => <base.Item />`,
      ]) {
        const { code: output, fallback } = result(code);
        expect(output, code).toContain(`const base = { color: 'red' }`);
        expect(fallback, code).toMatchObject({
          line: 3,
          column: 5,
          construct: "a style that is not an object literal",
        });
      }
      const exported = lean(
        `import { css } from '@nishikijs/react'\nexport const base = { color: 'red' }\ncss(base)`,
        "a.ts",
      )!;
      expect(exported.code).toContain(`export const base = { color: 'red' }`);
      expect(exported.fallback).toMatchObject({ line: 3, column: 5 });
    });

    it("tells a constant from a binding that shadows it", () => {
      const result = transform(
        `import { css } from '@nishikijs/react'\nconst base = { color: 'red' }\ncss(base)\nfunction f(base) { return css(base) }`,
        "a.ts",
      )!;
      expect(result.code).toContain(`const base = _nishiki$0`);
      expect(result.fallback).toMatchObject({ line: 4, column: 31 });
    });

    it("compiles css calls in the parts of a conditional that are not styles", () => {
      const output = compile(
        `import { css } from '@nishikijs/react'\nexport const A = (p) => <div css={f(css({ margin: 0 })) ? { color: 'red' } : null} />`,
      )!;
      expect(output).toContain(`css={f(css(_nishiki$0)) ? _nishiki$1 : null}`);
    });

    it("keeps the object of styles with a runtime part, hoisting only its compiled values", () => {
      const output = compile(`export const A = (p) => <div css={{ color: 'red', margin: p.m }} />`)!;
      expect(output).toContain('css={{ color: _nishiki$0, margin: _nishiki$v("margin", p.m, "n0.a.a.a") }}');
    });

    it("skips files that cannot reference the runtime", () => {
      expect(transform(`export const x = 1`, "a.ts")).toBeNull();
    });
  });

  describe("scope", () => {
    const header = `import { css, styled } from '@nishikijs/react'\n`;
    const shadowing = {
      parameter: `function f(css) { return css({ color: 'red' }) }`,
      "destructured parameter": `const f = ({ css }) => css({ color: 'red' })`,
      "default parameter": `const f = ([css] = []) => css({ color: 'red' })`,
      "rest parameter": `const f = (...css) => css({ color: 'red' })`,
      "block const": `{ const css = (s) => s; css({ color: 'red' }) }`,
      "let used before its declaration": `function f() { css({ color: 'red' }); let css }`,
      "hoisted var": `function f() { if (x) { css({ color: 'red' }) } var css = g }`,
      "nested function declaration": `function f() { css({ color: 'red' }); function css(s) { return s } }`,
      "named function expression": `const f = function css(n) { return n && css({ color: 'red' }) }`,
      "catch parameter": `try {} catch (css) { css({ color: 'red' }) }`,
      "class declaration": `function f() { class css {}; return css({ color: 'red' }) }`,
      "for-of binding": `for (const css of list) css({ color: 'red' })`,
      "styled parameter": `function f(styled) { return styled('div', { color: 'red' }) }`,
    };

    for (const [name, body] of Object.entries(shadowing)) {
      it(`does not compile calls to a css or styled shadowed by a ${name}`, () => {
        expect(compile(header + body, "a.js", { cssProp: false })).toBeUndefined();
      });
    }

    it("does not compile calls to a css shadowed by a TypeScript parameter property", () => {
      const source = header + `class A { constructor(private css: (s: object) => void) { css({ color: 'red' }) } }`;
      expect(compile(source, "a.ts", { cssProp: false })).toBeUndefined();
    });

    it("still compiles calls outside the shadowing scope", () => {
      const output = compile(
        header + `function f(css) { return css({ color: 'red' }) }\nexport const a = css({ color: 'blue' })`,
        "a.js",
      )!;
      expect(output).toContain(`return css({ color: 'red' })`);
      expect(output).toContain(`export const a = css(_nishiki$0)`);
    });

    it("still compiles calls when an inner scope declares an unrelated name", () => {
      const output = compile(header + `function f(color) { return css({ color: 'red' }) }`, "a.js")!;
      expect(output).toContain(`return css(_nishiki$0)`);
    });
  });

  describe("syntax", () => {
    const red = packed(["color", "red"]);

    it("compiles through generics, satisfies and non-null assertions", () => {
      const output = compile(
        `import { css, styled } from '@nishikijs/react'\n` +
          `const a = css<unknown>({ color: 'red' } satisfies object)\n` +
          `const b = css(({ color: 'red' })!)\n` +
          `const C = styled<'div', { tone: string }>('div', { color: 'red' } as const)\n` +
          `const D = <T,>(p: T) => <div css={{ color: 'red' as const }} />`,
        "a.tsx",
      )!;
      expect(output).toContain(`const _nishiki$0 = _nishiki$(${red});`);
      expect(output).toContain("css<unknown>(_nishiki$0)");
      expect(output).toContain("css(_nishiki$0)");
      expect(output).toContain("styled<'div', { tone: string }>('div', _nishiki$0)");
      expect(output).toContain("<div css={_nishiki$0} />");
    });

    it("compiles the css prop on member expression and namespaced elements", () => {
      const output = compile(
        `export const A = () => <><motion.div css={{ color: 'red' }} /><Ui.Box.Inner css={{ color: 'red' }} /></>`,
      )!;
      expect(output).toContain("<motion.div css={_nishiki$0} /><Ui.Box.Inner css={_nishiki$0} />");
    });

    it("ignores css attributes that are not expressions or not named css", () => {
      expect(compile(`export const A = () => <div css="color: red" />`)).toBeUndefined();
      expect(compile(`export const A = () => <div data-css={{ color: 'red' }} />`)).toBeUndefined();
    });

    it("compiles aliased and string-named imports", () => {
      const output = compile(
        `import { css as c, "styled" as s } from '@nishikijs/react'\nc({ color: 'red' })\ns('a', { color: 'red' })`,
        "a.js",
      )!;
      expect(output).toContain("c(_nishiki$0)\ns('a', _nishiki$0)");
    });

    it("does not compile namespace, default or member calls, and loads the compiler for them", () => {
      const options = { cssProp: false };
      for (const code of [
        `import * as k from '@nishikijs/react'\nk.css({ color: 'red' })`,
        `import css from '@nishikijs/react'\ncss({ color: 'red' })`,
      ]) {
        expect(lean(code, "a.js", options)?.code).toBe(
          `import "@nishikijs/react/compiler";\n` + code.replace(`'@nishikijs/react'`, `"@nishikijs/react/lean"`),
        );
      }
      expect(
        compile(`import { css } from '@nishikijs/react'\nobj.css({ color: 'red' })`, "a.js", options),
      ).toBeUndefined();
    });

    it("evaluates template literals without expressions as static", () => {
      const output = compile(`import { css } from '@nishikijs/react'\ncss({ [\`color\`]: \`red\` })`, "a.js")!;
      expect(output).toContain(`const _nishiki$0 = _nishiki$(${red});`);
      const dynamic = compile(
        `import { css } from '@nishikijs/react'\ncss({ color: \`\${tone}\`, margin: 0 })`,
        "a.js",
      )!;
      expect(dynamic).toContain('css({ color: _nishiki$v("color", `${tone}`, "n0"), margin: _nishiki$0 })');
    });

    it("normalises numeric and quoted keys the way JavaScript does", () => {
      const output = compile(
        `import { css } from '@nishikijs/react'\ncss({ 1.0: 'a', 0x10: 'b', "&[title='x']": { color: 'red' }, '--a"b': 1 })`,
        "a.js",
      )!;
      const entries = packed(["1", "a"], ["16", "b"], ["&[title='x']", { color: "red" }], ['--a"b', 1]);
      expect(output).toContain(`const _nishiki$0 = _nishiki$(${entries});`);
    });

    it("sets the prototype only for a non-computed __proto__ key, as JavaScript does", () => {
      const inherited = packed(["padding", 1], [":hover", { color: "red" }]);
      for (const key of ["__proto__", '"__proto__"', "'__proto__'"]) {
        const output = compile(
          `import { css } from '@nishikijs/react'\ncss({ ${key}: { ":hover": { color: 'red' } }, padding: 1 })`,
          "a.js",
        )!;
        expect(output).toContain(`const _nishiki$0 = _nishiki$(${inherited});`);
      }
      const own = packed(["__proto__", { ":hover": { color: "red" } }], ["padding", 1]);
      for (const key of ['["__proto__"]', "[`__proto__`]"]) {
        const output = compile(
          `import { css } from '@nishikijs/react'\ncss({ ${key}: { ":hover": { color: 'red' } }, padding: 1 })`,
          "a.js",
        )!;
        expect(output).toContain(`const _nishiki$0 = _nishiki$(${own});`);
      }
    });

    it("treats methods and shorthand properties as runtime source", () => {
      const output = compile(
        `import { css } from '@nishikijs/react'\ncss({ margin: 0, color() {}, padding: 1, display })`,
        "a.js",
      )!;
      expect(output).toContain(`const _nishiki$1 = _nishiki$(${packed(["padding", 1])});`);
      expect(output).toContain(
        `css({ margin: _nishiki$0, color() {}, padding: _nishiki$1, display: _nishiki$v("display", display, "n0") })`,
      );
    });

    it("leaves an object a getter can read through `this` to runtime", () => {
      const options = { cssProp: false };
      const getter = `import { css } from '@nishikijs/react'\ncss({ margin: 0, get color() { return this.margin ? 'red' : 'blue' } })`;
      const proto = `import { css } from '@nishikijs/react'\ncss({ __proto__: base, margin: 0 })`;
      for (const code of [getter, proto]) {
        expect(lean(code, "a.js", options)?.code, code).toBe(
          `import "@nishikijs/react/compiler";\n` + code.replace(`'@nishikijs/react'`, `"@nishikijs/react/lean"`),
        );
      }
      const nested = compile(
        `import { css } from '@nishikijs/react'\ncss({ get color() { return tone }, margin: css({ padding: 1 }) })`,
        "a.js",
      )!;
      expect(nested).toContain("margin: css(_nishiki$0)");
    });

    it("compiles css calls nested in the runtime values of an object", () => {
      const inner = packed(["padding", 1]);
      const dynamicOuter = compile(
        `import { css } from '@nishikijs/react'\ncss({ color: tone, margin: f(css({ padding: 1 })) })`,
        "a.js",
      )!;
      expect(dynamicOuter).toContain(`const _nishiki$0 = _nishiki$(${inner});`);
      expect(dynamicOuter).toContain(
        'css({ color: _nishiki$v("color", tone, "n0"), margin: _nishiki$v("margin", f(css(_nishiki$0)), "n0.a.a.a") })',
      );

      const compiledOuter = compile(
        `import { css } from '@nishikijs/react'\ncss({ margin: f(css({ padding: 1 })), color: 'red' })`,
        "a.js",
      )!;
      expect(compiledOuter).toContain(`const _nishiki$0 = _nishiki$(${red});`);
      expect(compiledOuter).toContain(`const _nishiki$1 = _nishiki$(${inner});`);
      expect(compiledOuter).toContain(
        'css({ margin: _nishiki$v("margin", f(css(_nishiki$1)), "n0.a.a.a"), color: _nishiki$0 })',
      );
    });

    it("compiles css props inside the children of a dynamic css prop", () => {
      const output = compile(`export const A = (p) => <div css={p.css}><i css={{ color: 'red' }} /></div>`)!;
      expect(output).toContain("<div css={p.css}><i css={_nishiki$0} /></div>");
    });

    it("returns null for files with syntax errors", () => {
      expect(transform(`import { css } from '@nishikijs/react'\ncss({ color: 'red' `, "a.js")).toBeNull();
      expect(transform(`export const A = () => <div css={{ color: 'red' }}>`, "a.tsx")).toBeNull();
      expect(transform(`const a: number = css({ color: 'red' })`, "a.js")).toBeNull();
    });

    it("parses by extension and ignores query strings", () => {
      expect(compile(`export const A = () => <div css={{ color: 'red' }} />`, "/src/a.jsx?v=1")).toContain(
        "_nishiki$0",
      );
      expect(compile(`import { css } from '@nishikijs/react'\ncss({ color: 'red' } as const)`, "/src/a.mts")).toContain(
        "css(_nishiki$0)",
      );
      // `<T>x` is JSX in .tsx, so it only parses as a type assertion when the extension says .ts.
      expect(
        compile(`import { css } from '@nishikijs/react'\ncss(<any>{ color: 'red' })`, "/src/a.tsx"),
      ).toBeUndefined();
      expect(compile(`import { css } from '@nishikijs/react'\ncss(<any>{ color: 'red' })`, "/src/a.ts")).toContain(
        "css(_nishiki$0)",
      );
      expect(compile(`import { css } from '@nishikijs/react'\ncss({ color: <const>'red' })`, "/src/a.ts")).toContain(
        "css(_nishiki$0)",
      );
    });

    it("prefixes its warnings with [nishiki], whichever bundler reports them", () => {
      const result = transform(
        `export const A = () => <div css={{ ".x &": { color: 'red' }, margin: '0 !important' }} />`,
        "a.tsx",
      );
      expect(result!.warnings).toEqual([
        expect.stringMatching(/^\[nishiki\] ".x &" is not in conditions\.order/),
        expect.stringMatching(/^\[nishiki\] "margin: 0 !important" is !important/),
      ]);
    });

    it("inserts the import after every directive, including with comments before them", () => {
      const output = compile(
        `// header\n'use client';\n"use strict";\nexport const A = () => <div css={{ color: 'red' }} />`,
      )!;
      expect(output.startsWith(`// header\n'use client';\n"use strict";\nimport { __k as _nishiki$ }`)).toBe(true);
    });

    it("uses the configured import source for the helper", () => {
      const output = compile(`import { css } from '@acme/nishiki'\ncss({ color: 'red' })`, "a.js", {
        importSource: "@acme/nishiki",
      })!;
      expect(output).toMatch(/^import \{ __k as _nishiki\$ \} from "@acme\/nishiki";/);
    });
  });

  describe("source maps", async () => {
    const { TraceMap, originalPositionFor, generatedPositionFor } = await import("@jridgewell/trace-mapping");
    const source = [
      `'use client'`,
      `import { css } from '@nishikijs/react'`,
      `export const a = css({ color: 'red' })`,
      `export const b = (p) => <div css={{ margin: 0, padding: p.x }} id="target" />`,
    ].join("\n");
    const result = transform(source, "/src/a.tsx")!;
    const map = new TraceMap(result.map as any);
    const lines = result.code.split("\n");
    const locate = (text: string) => {
      const line = lines.findIndex((item) => item.includes(text));
      return { line: line + 1, column: lines[line]!.indexOf(text) };
    };

    it("points at the original file and embeds its content", () => {
      expect(result.map.sources).toEqual(["/src/a.tsx"]);
      expect(result.map.sourcesContent).toEqual([source]);
    });

    it("maps untouched code back to where it was written", () => {
      expect(originalPositionFor(map, locate("export const b"))).toMatchObject({ line: 4, column: 0 });
      expect(originalPositionFor(map, locate('id="target"'))).toMatchObject({
        line: 4,
        column: source.split("\n")[3]!.indexOf('id="target"'),
      });
    });

    it("maps a compiled call site back to its object literal", () => {
      expect(originalPositionFor(map, locate("css(_nishiki$0)"))).toMatchObject({ line: 3, column: 17 });
      expect(originalPositionFor(map, locate("_nishiki$0)"))).toMatchObject({ line: 3, column: 21 });
      expect(generatedPositionFor(map, { source: "/src/a.tsx", line: 4, column: 0 })).toMatchObject(
        locate("export const b"),
      );
    });
  });

  describe("compiled output with extract matches runtime output", async () => {
    const source = await readFile(new URL("../../test/unplugin/fixtures/equivalence.js", import.meta.url), "utf8");
    const output = compileModule(
      source,
      "equivalence.js",
      { extract: true },
      { cssImport: false, configImport: false, lean: false },
    )!;
    const original = evaluate(source);
    const transformed = evaluate(output.code);
    const extracted = new Map(output.rules);
    type Rules = readonly (readonly [string, string])[];
    const rulesOf = (Styles: () => { props: { rules: Rules } } | null) => Styles()?.props.rules ?? [];

    for (const name of Object.keys(original.cases)) {
      it(name, () => {
        const [className, Styles] = original.cases[name]();
        const [compiledClassName, CompiledStyles] = transformed.cases[name]();
        expect(compiledClassName).toBe(className);
        // Every rule the runtime inserts is inserted or extracted.
        const inserted = new Map(rulesOf(CompiledStyles));
        for (const [rule, text] of rulesOf(Styles)) {
          expect(inserted.get(rule) ?? extracted.get(rule), rule).toBe(text);
        }
      });
    }

    it("folds css() of nothing but literal styles into a constant", () => {
      for (const name of ["literal", "literalList", "literalListOverride"]) {
        expect(output.code).toMatch(new RegExp(`\\n {2}${name}: \\(\\) =>\\s+_nishiki\\$\\d+,\\n`));
      }
      expect(output.code).toMatch(/\nconst _nishiki\$\d+ = \["(n[0-9a-z]+ ?)+", _nishiki\$n\];\n/);
    });
  });

  describe("compiled output matches runtime output", async () => {
    const source = await readFile(new URL("../../test/unplugin/fixtures/equivalence.js", import.meta.url), "utf8");
    const output = transform(source, "equivalence.js")!;

    const original = evaluate(source);
    const transformed = evaluate(output.code);
    // `css` returns the class names and a component whose element carries the rules it inserts.
    const outcome = (fn: () => [string, () => { props: { rules: readonly (readonly [string, string])[] } }]) => {
      const [className, Styles] = fn();
      return {
        classes: new Set(className.split(" ").filter(Boolean)),
        rules: new Set(Styles().props.rules.map(([, text]) => text)),
      };
    };

    for (const name of Object.keys(original.cases)) {
      it(name, () => {
        expect(outcome(transformed.cases[name])).toEqual(outcome(original.cases[name]));
      });
    }

    const ordered = (fn: () => [string, () => { props: { rules: readonly (readonly [string, string])[] } }]) => {
      const [className, Styles] = fn();
      return { className, rules: Styles().props.rules };
    };
    for (const name of original.ordered as string[]) {
      it(`${name} in order`, () => {
        expect(ordered(transformed.cases[name])).toEqual(ordered(original.cases[name]));
      });
    }

    // Rules for one property in one layer tie, leaving the winner to the document order.
    const ties = (rules: readonly (readonly [string, string])[]) => {
      const seen = new Map<string, string>();
      const tied: string[] = [];
      for (const [, text] of rules) {
        const slot = /^@layer ([^{]+)/.exec(text)![1] + " " + /\{([-\w]+):[^{}]*\}+$/.exec(text)![1];
        if (seen.has(slot)) tied.push(seen.get(slot)! + " / " + text);
        seen.set(slot, text);
      }
      return tied;
    };
    it("ranks a repeated breakpoint on the ladder, so where its rule lands no longer decides", () => {
      expect(ties(ordered(original.cases.repeatedConditionOnLadder).rules)).toEqual([]);
      expect(ordered(transformed.cases.repeatedConditionOnLadder)).toEqual(
        ordered(original.cases.repeatedConditionOnLadder),
      );
      // Widths off the ladder still tie, so only the key's first position, as the literal keeps it, decides.
      expect(ties(ordered(original.cases.repeatedCondition).rules)).toHaveLength(1);
    });

    it("compiled the constants only read as style input in place, and only those", () => {
      expect(output.code).toMatch(/\nconst shared = _nishiki\$\d+;\nconst sharedList = \[shared, _nishiki\$\d+\];\n/);
      expect(output.code).toMatch(
        /\nconst sharedLater = \{ ":hover": _nishiki\$\d+, margin: _nishiki\$v\("margin", tone\.length, /,
      );
      expect(output.code).toContain(`const dynamic = { color: "blue", margin: 4 };`);
    });

    it("compiled a value in every case but those left to runtime", () => {
      const body = (name: string) =>
        new RegExp(`\\n  ${name}: \\(\\) =>([\\s\\S]*?)(?=\\n  (?://|\\w+: \\(\\) =>)|\\n\\};)`).exec(output.code)![1]!;
      const uncompiled = Object.keys(original.cases).filter((name) => !body(name).includes("_nishiki$"));
      expect(uncompiled).toEqual(original.uncompiled);
    });
  });
}
