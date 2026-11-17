import MagicString from "magic-string";
import { parseSync } from "oxc-parser";
import { layerStatement } from "../core/config.ts";
import { depthOf } from "../core/properties.ts";
import {
  compileEntry,
  createTable,
  hash,
  layerName,
  noticeMessage,
  rankOfLayer,
  type CompileContext,
  type ConditionOptions,
  type Entry,
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

/** The source of the module that configures the runtime. */
export const configModule = (options: TransformOptions): string =>
  `import { __c } from ${JSON.stringify(options.importSource ?? "@nishikijs/react")};\n` + configCall("__c", options);

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
/** Text a module that refers to nishiki's `css`, `styled` or the css prop has. */
export const QUICK_FILTER: RegExp = /\bcss\b|\bstyled\b/;
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

interface CompiledObject {
  /** The entries of the whole object, when every key and value is known before runtime. */
  entries: Entry[];
  /** Otherwise the values compiled in place, so the object JavaScript builds at runtime decides their order. */
  values: { node: Node; entries: Entry[] }[];
  /** And the runtime values of properties, which compile at runtime in the layer the build ranks their key into. */
  ranked: { property: Node; key: string; layer: string }[];
  /** Whether anything is left that only nishiki's compiler can compile at runtime. */
  raw: boolean;
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

function compileObject(node: Node, context: CompileContext): CompiledObject | null {
  const value = staticValue(node);
  if (value !== UNKNOWN) {
    const styles = value as Record<string, unknown>;
    // Keyed by merge key the way `resolve` merges, so a key that only reads differently (`&:hover` for `:hover`) or
    // one selector of a list still overrides what came before it.
    const merged = new Map<string, Entry>();
    for (const key in styles) {
      for (const entry of compileEntry(key, styles[key], context)) {
        merged.delete(entry[0]);
        merged.set(entry[0], entry);
      }
    }
    return merged.size === 0 ? null : { entries: [...merged.values()], values: [], ranked: [], raw: false };
  }

  const properties: Node[] = node.properties;
  // A getter, in the literal or on a prototype only known at runtime, reads the object's values through `this`, so
  // compiling a value in place would change what it sees.
  const observed = properties.some(
    (property) => property.kind === "get" || (setsPrototype(property) && staticValue(property.value) === UNKNOWN),
  );
  if (observed) return null;
  const keys = properties.map((property) => (setsPrototype(property) ? null : keyName(property)));
  const values: CompiledObject["values"] = [];
  const ranked: CompiledObject["ranked"] = [];
  let raw = false;
  properties.forEach((property, index) => {
    if (setsPrototype(property)) {
      // A prototype's keys reach `resolve` too, which only the compiler can compile.
      if (staticValue(property.value) !== null) raw = true;
      return;
    }
    const key = staticKey(property);
    if (key === null) {
      raw = true;
      return;
    }
    // A key written again later is never read.
    if (keys.includes(key, index + 1)) return;
    const literal = property.shorthand ? UNKNOWN : staticValue(property.value);
    if (literal !== UNKNOWN) {
      values.push({ node: property.value, entries: compileEntry(key, literal, context) });
      return;
    }
    const layer = unwrap(property.value).type === "ObjectExpression" ? null : layerOfProperty(key);
    if (layer === null) raw = true;
    else ranked.push({ property, key, layer });
  });
  return values.length + ranked.length === 0 ? null : { entries: [], values, ranked, raw };
}

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

const BLOCK_SCOPES = new Set([
  "BlockStatement",
  "StaticBlock",
  "SwitchStatement",
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "TSModuleBlock",
]);

/** Source ranges of the scopes in which a local declaration shadows one of `names`. */
function shadowedRanges(program: Node, names: ReadonlySet<string>): Array<readonly [number, number]> {
  const ranges: Array<readonly [number, number]> = [];
  const declare = (pattern: Node | null, scope: Node) => {
    if (bindingNames(pattern).some((name) => names.has(name))) ranges.push([scope.start, scope.end]);
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

function langOf(id: string): "js" | "jsx" | "ts" | "tsx" {
  const extension = /\.([cm]?[jt]sx?)$/.exec(id)?.[1] ?? "tsx";
  if (extension.endsWith("tsx")) return "tsx";
  if (extension.endsWith("ts")) return "ts";
  if (extension.endsWith("jsx")) return "jsx";
  return "jsx";
}

/**
 * Whether anything other than the calls the compiler handled can hand the runtime a style object: `css` or `styled`
 * passed around as a value, or an object with a `css` key, which reaches the css prop through a spread.
 */
function escapes(
  program: Node,
  names: ReadonlySet<string>,
  handled: ReadonlySet<Node>,
  shadowed: ReadonlyArray<readonly [number, number]>,
  cssProp: boolean,
): boolean {
  let found = false;
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
        if (cssProp && !node.computed && keyed(node.key)) found = true;
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
          found = true;
        }
        return true;
      default:
        return found;
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
  return compileModule(code, id, options, { cssImport: true, configImport: false });
}

export interface ModuleOptions {
  // Planned Vite, Rollup and Rolldown builds turn this off to leave the CSS import out and emit the rules themselves.
  cssImport: boolean;
  // Import the plugin's config module rather than pass the conditions along in every module, as a loader has to.
  configImport: boolean;
}

export function compileModule(
  code: string,
  id: string,
  options: TransformOptions,
  { cssImport, configImport }: ModuleOptions,
): TransformResult | null {
  const { importSource = "@nishikijs/react", cssProp = true } = options;
  const extract = Boolean(options.extract);
  if (!QUICK_FILTER.test(code)) return null;

  const filename = id.replace(/[?#].*$/, "");
  const { program, errors } = parseSync(filename, code, { lang: langOf(filename) });
  if (errors.length > 0) return null;

  const cssNames = new Set<string>();
  const styledNames = new Set<string>();
  // Whether the module may hand the runtime a style object to compile.
  let runtime = false;
  for (const statement of program.body as Node[]) {
    if (statement.type !== "ImportDeclaration" || statement.source.value !== importSource) continue;
    for (const specifier of statement.specifiers) {
      if (specifier.type !== "ImportSpecifier") {
        runtime = true;
        continue;
      }
      const name = specifier.imported.name ?? specifier.imported.value;
      if (name === "css") cssNames.add(specifier.local.name);
      if (name === "styled") styledNames.add(specifier.local.name);
    }
  }
  if (!cssProp && cssNames.size === 0 && styledNames.size === 0 && !runtime) return null;

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
  const s = new MagicString(code);
  const extracted = new Map<string, string>();
  const hoisted = new Map<string, string>();
  let replaced = 0;

  // Compiled styles are hoisted so every render passes the same object, which `resolve` caches by identity.
  const hoist = (compiledEntries: Entry[]): string => {
    const entries = extract
      ? compiledEntries.map(([key, className, rules]): Entry => {
          for (const [ruleClass, text] of rules) extracted.set(ruleClass, text);
          return [key, className, []];
        })
      : compiledEntries;
    const call = HELPER + "(" + JSON.stringify(entries) + ")";
    let name = hoisted.get(call);
    if (!name) hoisted.set(call, (name = HELPER + hoisted.size));
    return name;
  };

  const handled = new Set<Node>();
  let valued = false;
  const replace = (target: Node): boolean => {
    const node = unwrap(target);
    const result = node.type === "ObjectExpression" ? compileObject(node, context) : null;
    if (!result) {
      runtime = true;
      return false;
    }

    if (result.entries.length > 0) {
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
      if (result.raw) runtime = true;
    }
    replaced++;
    return true;
  };

  const visit = (node: Node): boolean => {
    if (node.type === "CallExpression" && node.callee.type === "Identifier") {
      const args: Node[] = node.arguments;
      const name = importedName(node.callee);
      const compiledArgs =
        name === null ? [] : cssNames.has(name) ? args : styledNames.has(name) ? args.slice(1, 2) : [];
      if (compiledArgs.length > 0) {
        handled.add(node.callee);
        if (args.length > 2 && styledNames.has(name!)) runtime = true;
        for (const arg of args) {
          if (!compiledArgs.includes(arg) || !replace(arg)) walk(arg, visit);
        }
        return true;
      }
    }
    if (cssProp && node.type === "JSXAttribute" && node.name.type === "JSXIdentifier" && node.name.name === "css") {
      if (node.value?.type === "JSXExpressionContainer") return replace(node.value.expression);
      runtime = true;
    }
    return false;
  };
  walk(program, visit);
  if (!runtime) runtime = escapes(program, new Set([...cssNames, ...styledNames]), handled, shadowed, cssProp);

  // A module that leaves styles to runtime configures it as well, since it may compile them before any other does.
  const configured = options.conditions !== undefined && (replaced > 0 || runtime);
  // The build plugin gives nishiki compiled modules @nishikijs/react/lean, which leaves the compiler out.
  const compiler = runtime && importSource === "@nishikijs/react";
  if (replaced === 0 && !configured && !compiler) return null;

  let header = compiler ? `import "@nishikijs/react/compiler";\n` : "";
  const helpers = [replaced > 0 && hoisted.size > 0 && `__k as ${HELPER}`, valued && `__v as ${HELPER}v`].filter(
    Boolean,
  );
  if (helpers.length > 0) header += `import { ${helpers.join(", ")} } from ${JSON.stringify(importSource)};\n`;
  if (configured) {
    header += configImport
      ? `import ${JSON.stringify(CONFIG_ID)};\n`
      : `import { __c as ${HELPER}c } from ${JSON.stringify(importSource)};\n` + configCall(HELPER + "c", options);
  }
  let cssResult: TransformResult["css"];
  if (extract && cssImport && extracted.size > 0) {
    const cssId = cssModuleId(id);
    header += `import ${JSON.stringify("./" + /[^/\\]*$/.exec(cssId)![0])};\n`;
    cssResult = {
      id: cssId,
      code: prefixOrder(extracted.values()) + "\n" + [...extracted.values()].join("\n") + "\n",
    };
  }
  for (const [call, name] of hoisted) header += `const ${name} = ${call};\n`;

  const directives = (program.body as Node[]).filter((statement) => typeof statement.directive === "string");
  const last = directives.at(-1);
  if (last) s.appendLeft(last.end, "\n" + header);
  else s.prepend(header);

  return {
    code: s.toString(),
    map: s.generateMap({ source: filename, includeContent: true, hires: "boundary" }),
    css: cssResult,
    rules: [...extracted],
    warnings: [...warnings],
  };
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;
  const { readFile } = await import("node:fs/promises");
  const { evaluate } = await import("../../test/unplugin/helpers/evaluate.ts");

  const compile = (code: string, id = "file.tsx", options = {}) => transform(code, id, options)?.code;

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
    const configured = (code: string, configImport: boolean) =>
      compileModule(code, "/src/a.tsx", { conditions }, { cssImport: true, configImport })?.code;

    it("configures the runtime in a module that only leaves styles to it", () => {
      for (const code of [
        `export const A = (p) => <div css={p.styles} />`,
        `import { css } from '@nishikijs/react'\nexport const a = (s) => css(s)`,
        `import { styled } from '@nishikijs/react'\nexport const B = styled('b', (p) => ({ color: p.$c }))`,
      ]) {
        expect(configured(code, true), code).toBe(
          `import "@nishikijs/react/compiler";\nimport "${CONFIG_ID}";\n` + code,
        );
        expect(configured(code, false), code).toBe(
          `import "@nishikijs/react/compiler";\nimport { __c as _nishiki$c } from "@nishikijs/react";\n_nishiki$c({"breakpoints":["600px"]},${tableOf({ conditions }).size});\n` +
            code,
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
    const leaves = (code: string) => compile(code)?.includes(`import "@nishikijs/react/compiler";`) ?? false;

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
        `import { styled } from '@nishikijs/react'\nstyled('a', (p) => ({ color: p.$c }))`,
      ]) {
        expect(leaves(code), code).toBe(true);
      }
    });

    it("loads the compiler where a style object reaches the runtime, from nishiki only", () => {
      expect(compile(`export const A = (p) => <div css={p.styles} />`)).toBe(
        `import "@nishikijs/react/compiler";\nexport const A = (p) => <div css={p.styles} />`,
      );
      expect(compile(`import { css } from 'acme'\ncss(s)`, "a.ts", { importSource: "acme" })).toBeUndefined();
      expect(compile(`import { css } from '@nishikijs/react'\ncss({ color: 'red' })`)).not.toContain(
        "@nishikijs/react/compiler",
      );
    });

    it("leaves a module it cannot parse to the bundler, which reports the error", () => {
      expect(compile(`export const x = <div css={{ color: 'red' }} `)).toBeUndefined();
    });
  });

  describe("transform", () => {
    it("compiles a static css prop and imports the helper", () => {
      const output = compile(`export const A = () => <div css={{ color: 'red' }} />`)!;
      expect(output).toMatch(/^import \{ __k as _nishiki\$ \} from "@nishikijs\/react";\nconst _nishiki\$0 = /);
      expect(output).toMatch(
        /\nconst _nishiki\$0 = _nishiki\$\(\[\["color","n[0-9a-z]+",\[\["n[0-9a-z]+","@layer nishiki\.n0\{/,
      );
      expect(output).toContain("css={_nishiki$0}");
    });

    it("leaves styles that are not object literals alone", () => {
      expect(compile(`export const A = (p) => <div css={p.styles} />`)).not.toContain("_nishiki$");
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
      expect(output).toContain(`const _nishiki$0 = _nishiki$(${JSON.stringify(compileEntry("color", "red"))});`);
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

    it("moves rules into a CSS module when extracting", () => {
      const result = transform(`export const A = () => <div css={{ color: 'red' }} />`, "/src/a.tsx", {
        extract: true,
      })!;
      expect(result.code).toContain(`import "./a.tsx.nishiki.css";`);
      expect(result.css!.id).toBe("/src/a.tsx.nishiki.css");
      expect(result.code).toMatch(/const _nishiki\$0 = _nishiki\$\(\[\["color","n[0-9a-z]+",\[\]\]\]\);/);
      expect(result.css!.code).toMatch(
        /^@layer nishiki\{@layer n0;\}\n@layer nishiki\.n0\{\.n[0-9a-z]+\{color:red\}\}\n$/,
      );
    });

    it("returns the extracted rules, and leaves the CSS import to a caller that emits them itself", () => {
      const source = `export const A = () => <div css={{ color: 'red' }} />`;
      const [, className, rules] = compileEntry("color", "red")[0]!;
      const imported = transform(source, "/src/a.tsx", { extract: { split: "single" } })!;
      expect(imported.rules).toEqual(rules);
      const planned = compileModule(source, "/src/a.tsx", { extract: true }, { cssImport: false, configImport: true })!;
      expect(planned.css).toBeUndefined();
      expect(planned.rules).toEqual(rules);
      expect(planned.code).not.toContain(".nishiki.css");
      expect(planned.code).toContain(JSON.stringify(["color", className, []]));
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
    const red = JSON.stringify(compileEntry("color", "red"));

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
      expect(compile(`export const A = () => <div css="color: red" />`)).not.toContain("_nishiki$");
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
        expect(compile(code, "a.js", options)).toBe(`import "@nishikijs/react/compiler";\n` + code);
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
      const entries = [
        ...compileEntry("1", "a"),
        ...compileEntry("16", "b"),
        ...compileEntry("&[title='x']", { color: "red" }),
        ...compileEntry('--a"b', 1),
      ];
      expect(output).toContain(`const _nishiki$0 = _nishiki$(${JSON.stringify(entries)});`);
    });

    it("sets the prototype only for a non-computed __proto__ key, as JavaScript does", () => {
      const inherited = [...compileEntry("padding", 1), ...compileEntry(":hover", { color: "red" })];
      for (const key of ["__proto__", '"__proto__"', "'__proto__'"]) {
        const output = compile(
          `import { css } from '@nishikijs/react'\ncss({ ${key}: { ":hover": { color: 'red' } }, padding: 1 })`,
          "a.js",
        )!;
        expect(output).toContain(`const _nishiki$0 = _nishiki$(${JSON.stringify(inherited)});`);
      }
      const own = [...compileEntry("__proto__", { ":hover": { color: "red" } }), ...compileEntry("padding", 1)];
      for (const key of ['["__proto__"]', "[`__proto__`]"]) {
        const output = compile(
          `import { css } from '@nishikijs/react'\ncss({ ${key}: { ":hover": { color: 'red' } }, padding: 1 })`,
          "a.js",
        )!;
        expect(output).toContain(`const _nishiki$0 = _nishiki$(${JSON.stringify(own)});`);
      }
    });

    it("treats methods and shorthand properties as runtime source", () => {
      const output = compile(
        `import { css } from '@nishikijs/react'\ncss({ margin: 0, color() {}, padding: 1, display })`,
        "a.js",
      )!;
      expect(output).toContain(`const _nishiki$1 = _nishiki$(${JSON.stringify(compileEntry("padding", 1))});`);
      expect(output).toContain(
        `css({ margin: _nishiki$0, color() {}, padding: _nishiki$1, display: _nishiki$v("display", display, "n0") })`,
      );
    });

    it("leaves an object a getter can read through `this` to runtime", () => {
      const options = { cssProp: false };
      const getter = `import { css } from '@nishikijs/react'\ncss({ margin: 0, get color() { return this.margin ? 'red' : 'blue' } })`;
      const proto = `import { css } from '@nishikijs/react'\ncss({ __proto__: base, margin: 0 })`;
      for (const code of [getter, proto]) {
        expect(compile(code, "a.js", options), code).toBe(`import "@nishikijs/react/compiler";\n` + code);
      }
      const nested = compile(
        `import { css } from '@nishikijs/react'\ncss({ get color() { return tone }, margin: css({ padding: 1 }) })`,
        "a.js",
      )!;
      expect(nested).toContain("margin: css(_nishiki$0)");
    });

    it("compiles css calls nested in the runtime values of an object", () => {
      const inner = JSON.stringify(compileEntry("padding", 1));
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

    it("compiled a value in every case but those left to runtime", () => {
      const body = (name: string) =>
        new RegExp(`\\n  ${name}: \\(\\) =>([\\s\\S]*?)(?=\\n  (?://|\\w+: \\(\\) =>)|\\n\\};)`).exec(output.code)![1]!;
      const uncompiled = Object.keys(original.cases).filter((name) => !body(name).includes("_nishiki$"));
      expect(uncompiled).toEqual(original.uncompiled);
    });
  });
}
