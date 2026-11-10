import MagicString from "magic-string";
import { parseSync } from "oxc-parser";
import { compileEntry, hash, LAYER_ORDER, type Entry } from "kiln/core";

export interface TransformOptions {
  /** Module the runtime is imported from. */
  importSource?: string;
  /** Compile `css={{...}}` on host elements. */
  cssProp?: boolean;
  /**
   * Emit static rules as CSS instead of inserting them at runtime. In Vite client builds, `true` or `{ split: "chunks" }`
   * gives each entry and lazily loaded chunk that adds rules a stylesheet with only those rules;
   * `{ split: "single" }`, or `build.cssCodeSplit: false`, gives each entry one stylesheet with every rule it can reach.
   * Other bundlers import a CSS module per source module, except Next.js with Turbopack, whose loader cannot add CSS
   * modules and inserts rules at runtime.
   */
  extract?: boolean | { split?: "chunks" | "single" };
}

export interface TransformResult {
  code: string;
  map: ReturnType<MagicString["generateMap"]>;
  /** Extracted CSS and the absolute id of the module it is imported from, when `extract` is on. */
  css?: { id: string; code: string };
  /** The extracted rules by class, when `extract` is on. */
  rules: [className: string, text: string][];
}

/**
 * Extracted CSS lives in a virtual module named after its source, `<source>.kiln.css`,
 * so any process can rebuild it from the source alone, without having run the transform.
 * A module id with a query, such as a code splitter's `?split=component`, is a different module
 * with its own rules, so its CSS module is `<source>.v<hash of the query>.kiln.css`. A query that changes on every
 * request therefore leaves a new CSS module each time; Vite drops its HMR timestamp from module ids before transforms run.
 */
export const CSS_SUFFIX = ".kiln.css";
const HELPER = "_kiln$";
const QUICK_FILTER = /\bcss\b|\bstyled\b/;
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
  if (property.type !== "Property" || property.kind !== "init" || property.method) return null;
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
      return node.name === "undefined" ? null : UNKNOWN;
    case "ObjectExpression": {
      const result: Record<string, unknown> = {};
      for (const property of node.properties) {
        const key = staticKey(property);
        if (key === null) return UNKNOWN;
        const value = staticValue(property.value);
        if (value === UNKNOWN) return UNKNOWN;
        result[key] = value;
      }
      return result;
    }
    default:
      return UNKNOWN;
  }
}

interface CompiledObject {
  entries: Entry[];
  dynamic: string[];
}

/**
 * Split an object literal into compiled entries and source left for runtime.
 * Properties up to the last spread or computed key stay dynamic as written, since
 * they may override each other in ways only runtime knows. Later literal keys always
 * win over them, which matches how `resolve` applies compiled entries after the dynamic part.
 */
function compileObject(node: Node, code: string): CompiledObject | null {
  const properties: Node[] = node.properties;
  let barrier = -1;
  properties.forEach((property, index) => {
    if (property.type === "SpreadElement" || staticKey(property) === null) barrier = index;
  });

  const dynamic = properties.slice(0, barrier + 1).map((property) => code.slice(property.start, property.end));
  const after = new Map<string, { entry: Entry } | { source: string }>();

  for (const property of properties.slice(barrier + 1)) {
    const key = staticKey(property)!;
    const value = staticValue(property.value);
    after.delete(key);
    after.set(
      key,
      value === UNKNOWN ? { source: code.slice(property.start, property.end) } : { entry: compileEntry(key, value) },
    );
  }

  const entries: Entry[] = [];
  for (const item of after.values()) {
    if ("entry" in item) entries.push(item.entry);
    else dynamic.push(item.source);
  }
  return entries.length === 0 ? null : { entries, dynamic };
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

// The tag goes in the basename rather than a query, which not every bundler keeps on a CSS id.
export function cssModuleId(id: string): string {
  const filename = id.replace(/[?#].*$/, "");
  const variant = id.slice(filename.length);
  return filename + (variant ? ".v" + hash(variant) : "") + CSS_SUFFIX;
}

export function transform(code: string, id: string, options: TransformOptions = {}): TransformResult | null {
  return compileModule(code, id, options, true);
}

// Planned Vite builds turn `cssImport` off to leave the CSS import out and emit the rules themselves.
export function compileModule(
  code: string,
  id: string,
  options: TransformOptions,
  cssImport: boolean,
): TransformResult | null {
  const { importSource = "kiln", cssProp = true } = options;
  const extract = Boolean(options.extract);
  if (!QUICK_FILTER.test(code)) return null;

  const filename = id.replace(/[?#].*$/, "");
  const { program, errors } = parseSync(filename, code, { lang: langOf(filename) });
  if (errors.length > 0) return null;

  const cssNames = new Set<string>();
  const styledNames = new Set<string>();
  for (const statement of program.body as Node[]) {
    if (statement.type !== "ImportDeclaration" || statement.source.value !== importSource) continue;
    for (const specifier of statement.specifiers) {
      if (specifier.type !== "ImportSpecifier") continue;
      const imported = specifier.imported.name ?? specifier.imported.value;
      if (imported === "css") cssNames.add(specifier.local.name);
      if (imported === "styled") styledNames.add(specifier.local.name);
    }
  }
  if (!cssProp && cssNames.size === 0 && styledNames.size === 0) return null;

  const shadowed =
    cssNames.size + styledNames.size > 0 ? shadowedRanges(program, new Set([...cssNames, ...styledNames])) : [];
  const importedName = (node: Node) =>
    shadowed.some(([start, end]) => start <= node.start && node.start < end) ? null : node.name;

  const s = new MagicString(code);
  const extracted = new Map<string, string>();
  const hoisted = new Map<string, string>();
  let replaced = 0;

  const replace = (target: Node): boolean => {
    const node = unwrap(target);
    if (node.type !== "ObjectExpression") return false;
    const result = compileObject(node, code);
    if (!result) return false;

    const entries = extract
      ? result.entries.map(([key, className, rules]): Entry => {
          for (const [ruleClass, text] of rules) extracted.set(ruleClass, text);
          return [key, className, []];
        })
      : result.entries;
    const call = HELPER + "(" + JSON.stringify(entries);
    if (result.dynamic.length > 0) {
      s.overwrite(target.start, target.end, call + ",{" + result.dynamic.join(",") + "})");
    } else {
      // Fully static styles are hoisted so every render passes the same object, which `resolve` caches by identity.
      let name = hoisted.get(call);
      if (!name) hoisted.set(call, (name = HELPER + hoisted.size));
      s.overwrite(target.start, target.end, name);
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
        for (const arg of args) {
          if (!compiledArgs.includes(arg) || !replace(arg)) walk(arg, visit);
        }
        return true;
      }
    }
    if (
      cssProp &&
      node.type === "JSXAttribute" &&
      node.name.type === "JSXIdentifier" &&
      node.name.name === "css" &&
      node.value?.type === "JSXExpressionContainer"
    ) {
      return replace(node.value.expression);
    }
    return false;
  };
  walk(program, visit);

  if (replaced === 0) return null;

  let header = `import { __k as ${HELPER} } from ${JSON.stringify(importSource)};\n`;
  let cssResult: TransformResult["css"];
  if (extract && cssImport && extracted.size > 0) {
    const cssId = cssModuleId(id);
    header += `import ${JSON.stringify("./" + /[^/\\]*$/.exec(cssId)![0])};\n`;
    cssResult = {
      id: cssId,
      code: LAYER_ORDER + "\n" + [...extracted.values()].join("\n") + "\n",
    };
  }
  for (const [call, name] of hoisted) header += `const ${name} = ${call});\n`;

  const directives = (program.body as Node[]).filter((statement) => typeof statement.directive === "string");
  const last = directives.at(-1);
  if (last) s.appendLeft(last.end, "\n" + header);
  else s.prepend(header);

  return {
    code: s.toString(),
    map: s.generateMap({ source: filename, includeContent: true, hires: "boundary" }),
    css: cssResult,
    rules: [...extracted],
  };
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;
  const { readFile } = await import("node:fs/promises");
  const { evaluate } = await import("../test/helpers/evaluate.ts");

  const compile = (code: string, id = "file.tsx", options = {}) => transform(code, id, options)?.code;

  describe("transform", () => {
    it("compiles a static css prop and imports the helper", () => {
      const output = compile(`export const A = () => <div css={{ color: 'red' }} />`)!;
      expect(output).toMatch(/^import \{ __k as _kiln\$ \} from "kiln";/);
      expect(output).toMatch(/\nconst _kiln\$0 = _kiln\$\(\[\["color","k[0-9a-z]+",\[\["k[0-9a-z]+","@layer k2\{/);
      expect(output).toContain("css={_kiln$0}");
    });

    it("leaves fully dynamic objects alone", () => {
      expect(compile(`export const A = (p) => <div css={{ color: p.color }} />`)).toBeUndefined();
      expect(compile(`export const A = (p) => <div css={p.styles} />`)).toBeUndefined();
    });

    it("keeps what precedes the last spread or computed key as runtime source", () => {
      const output = compile(`import { css } from 'kiln'\ncss({ a: x, ...rest, color: 'red', margin: m })`)!;
      expect(output).toMatch(/_kiln\$\(\[\["color".*\]\],\{a: x,\.\.\.rest,margin: m\}\)/);
    });

    it("only compiles css and styled imported from the runtime", () => {
      expect(compile(`import { css } from 'other'\ncss({ color: 'red' })`, "a.ts", { cssProp: false })).toBeUndefined();
      const output = compile(
        `import { styled as s } from 'kiln'\nexport const B = s('button', { color: 'red' })`,
        "a.ts",
      )!;
      expect(output).toContain(`s('button', _kiln$0)`);
    });

    it("compiles through TypeScript wrappers", () => {
      const output = compile(`import { css } from 'kiln'\ncss({ color: 'red' } as const)`, "a.ts")!;
      expect(output).toContain("css(_kiln$0)");
    });

    it("inserts the import after directives", () => {
      const output = compile(`'use client'\nexport const A = () => <div css={{ color: 'red' }} />`)!;
      expect(output.startsWith(`'use client'\nimport { __k as _kiln$ }`)).toBe(true);
    });

    it("moves rules into a CSS module when extracting", () => {
      const result = transform(`export const A = () => <div css={{ color: 'red' }} />`, "/src/a.tsx", {
        extract: true,
      })!;
      expect(result.code).toContain(`import "./a.tsx.kiln.css";`);
      expect(result.css!.id).toBe("/src/a.tsx.kiln.css");
      expect(result.code).toMatch(/const _kiln\$0 = _kiln\$\(\[\["color","k[0-9a-z]+",\[\]\]\]\);/);
      expect(result.css!.code).toMatch(/^@layer k0,.*;\n@layer k2\{\.k[0-9a-z]+\{color:red\}\}\n$/);
    });

    it("returns the extracted rules, and leaves the CSS import to a caller that emits them itself", () => {
      const source = `export const A = () => <div css={{ color: 'red' }} />`;
      const [[, className, rules]] = [compileEntry("color", "red")];
      const imported = transform(source, "/src/a.tsx", { extract: { split: "single" } })!;
      expect(imported.rules).toEqual(rules);
      const planned = compileModule(source, "/src/a.tsx", { extract: true }, false)!;
      expect(planned.css).toBeUndefined();
      expect(planned.rules).toEqual(rules);
      expect(planned.code).not.toContain(".kiln.css");
      expect(planned.code).toContain(JSON.stringify(["color", className, []]));
      expect(transform(source, "/src/a.tsx")!.rules).toEqual([]);
    });

    it("gives each query variant of a module its own CSS module", () => {
      const source = `export const A = () => <div css={{ color: 'red' }} />`;
      const plain = transform(source, "/src/a.tsx", { extract: true })!;
      const split = transform(source, "/src/a.tsx?split=component", { extract: true })!;
      const other = transform(source, "/src/a.tsx?split=loader", { extract: true })!;
      expect(split.css!.id).toMatch(/^\/src\/a\.tsx\.v[0-9a-z]+\.kiln\.css$/);
      expect(new Set([plain.css!.id, split.css!.id, other.css!.id]).size).toBe(3);
      expect(split.code).toContain(`import "./${split.css!.id.slice("/src/".length)}";`);
      expect(cssModuleId("/src/a.tsx#x")).not.toBe(plain.css!.id);
    });

    it("tags a query variant deterministically", () => {
      expect(cssModuleId("/src/a.tsx?split=component")).toBe(cssModuleId("/src/a.tsx?split=component"));
      expect(cssModuleId("/src/a.tsx?split=component")).toBe(`/src/a.tsx.v${hash("?split=component")}.kiln.css`);
    });

    it("hoists identical static styles into one module-level constant", () => {
      const output = compile(
        `export const A = () => <><i css={{ color: 'red' }} /><b css={{ color: 'red' }} /><u css={{ margin: 0 }} /></>`,
      )!;
      expect(output.match(/^const _kiln\$\d+ = /gm)).toHaveLength(2);
      expect(output).toContain("<i css={_kiln$0} /><b css={_kiln$0} /><u css={_kiln$1} />");
    });

    it("keeps styles with a runtime part inline", () => {
      const output = compile(`export const A = (p) => <div css={{ color: 'red', margin: p.m }} />`)!;
      expect(output).not.toMatch(/^const _kiln/m);
      expect(output).toContain("css={_kiln$([");
    });

    it("skips files that cannot reference the runtime", () => {
      expect(transform(`export const x = 1`, "a.ts")).toBeNull();
    });
  });

  describe("scope", () => {
    const header = `import { css, styled } from 'kiln'\n`;
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
      expect(output).toContain(`export const a = css(_kiln$0)`);
    });

    it("still compiles calls when an inner scope declares an unrelated name", () => {
      const output = compile(header + `function f(color) { return css({ color: 'red' }) }`, "a.js")!;
      expect(output).toContain(`return css(_kiln$0)`);
    });
  });

  describe("syntax", () => {
    const red = JSON.stringify([compileEntry("color", "red")]);

    it("compiles through generics, satisfies and non-null assertions", () => {
      const output = compile(
        `import { css, styled } from 'kiln'\n` +
          `const a = css<unknown>({ color: 'red' } satisfies object)\n` +
          `const b = css(({ color: 'red' })!)\n` +
          `const C = styled<'div', { tone: string }>('div', { color: 'red' } as const)\n` +
          `const D = <T,>(p: T) => <div css={{ color: 'red' as const }} />`,
        "a.tsx",
      )!;
      expect(output).toContain(`const _kiln$0 = _kiln$(${red});`);
      expect(output).toContain("css<unknown>(_kiln$0)");
      expect(output).toContain("css(_kiln$0)");
      expect(output).toContain("styled<'div', { tone: string }>('div', _kiln$0)");
      expect(output).toContain("<div css={_kiln$0} />");
    });

    it("compiles the css prop on member expression and namespaced elements", () => {
      const output = compile(
        `export const A = () => <><motion.div css={{ color: 'red' }} /><Ui.Box.Inner css={{ color: 'red' }} /></>`,
      )!;
      expect(output).toContain("<motion.div css={_kiln$0} /><Ui.Box.Inner css={_kiln$0} />");
    });

    it("ignores css attributes that are not expressions or not named css", () => {
      expect(compile(`export const A = () => <div css="color: red" />`)).toBeUndefined();
      expect(compile(`export const A = () => <div data-css={{ color: 'red' }} />`)).toBeUndefined();
    });

    it("compiles aliased and string-named imports", () => {
      const output = compile(
        `import { css as c, "styled" as s } from 'kiln'\nc({ color: 'red' })\ns('a', { color: 'red' })`,
        "a.js",
      )!;
      expect(output).toContain("c(_kiln$0)\ns('a', _kiln$0)");
    });

    it("does not compile namespace, default or member calls", () => {
      const options = { cssProp: false };
      expect(compile(`import * as k from 'kiln'\nk.css({ color: 'red' })`, "a.js", options)).toBeUndefined();
      expect(compile(`import css from 'kiln'\ncss({ color: 'red' })`, "a.js", options)).toBeUndefined();
      expect(compile(`import { css } from 'kiln'\nobj.css({ color: 'red' })`, "a.js", options)).toBeUndefined();
    });

    it("evaluates template literals without expressions as static", () => {
      const output = compile(`import { css } from 'kiln'\ncss({ [\`color\`]: \`red\` })`, "a.js")!;
      expect(output).toContain(`const _kiln$0 = _kiln$(${red});`);
      const dynamic = compile(`import { css } from 'kiln'\ncss({ color: \`\${tone}\`, margin: 0 })`, "a.js")!;
      expect(dynamic).toContain("{color: `${tone}`}");
    });

    it("normalises numeric and quoted keys the way JavaScript does", () => {
      const output = compile(
        `import { css } from 'kiln'\ncss({ 1.0: 'a', 0x10: 'b', "&[title='x']": { color: 'red' }, '--a"b': 1 })`,
        "a.js",
      )!;
      const entries = [
        compileEntry("1", "a"),
        compileEntry("16", "b"),
        compileEntry("&[title='x']", { color: "red" }),
        compileEntry('--a"b', 1),
      ];
      expect(output).toContain(`const _kiln$0 = _kiln$(${JSON.stringify(entries)});`);
    });

    it("treats getters, methods and shorthand properties as runtime source", () => {
      const output = compile(
        `import { css } from 'kiln'\ncss({ margin: 0, get color() { return 'red' }, padding: 1, display })`,
        "a.js",
      )!;
      expect(output).toContain(
        `css(_kiln$(${JSON.stringify([compileEntry("padding", 1)])},{margin: 0,get color() { return 'red' },display}))`,
      );
    });

    it("compiles css calls nested in a fully dynamic object, and leaves them alone in a compiled one", () => {
      const inner = JSON.stringify([compileEntry("padding", 1)]);
      const dynamicOuter = compile(
        `import { css } from 'kiln'\ncss({ color: tone, margin: f(css({ padding: 1 })) })`,
        "a.js",
      )!;
      expect(dynamicOuter).toContain(`const _kiln$0 = _kiln$(${inner});`);
      expect(dynamicOuter).toContain("css({ color: tone, margin: f(css(_kiln$0)) })");

      const compiledOuter = compile(
        `import { css } from 'kiln'\ncss({ margin: f(css({ padding: 1 })), color: 'red' })`,
        "a.js",
      )!;
      expect(compiledOuter).toContain(`css(_kiln$(${red},{margin: f(css({ padding: 1 }))}))`);
    });

    it("compiles css props inside the children of a dynamic css prop", () => {
      const output = compile(`export const A = (p) => <div css={p.css}><i css={{ color: 'red' }} /></div>`)!;
      expect(output).toContain("<div css={p.css}><i css={_kiln$0} /></div>");
    });

    it("returns null for files with syntax errors", () => {
      expect(transform(`import { css } from 'kiln'\ncss({ color: 'red' `, "a.js")).toBeNull();
      expect(transform(`export const A = () => <div css={{ color: 'red' }}>`, "a.tsx")).toBeNull();
      expect(transform(`const a: number = css({ color: 'red' })`, "a.js")).toBeNull();
    });

    it("parses by extension and ignores query strings", () => {
      expect(compile(`export const A = () => <div css={{ color: 'red' }} />`, "/src/a.jsx?v=1")).toContain("_kiln$0");
      expect(compile(`import { css } from 'kiln'\ncss({ color: 'red' } as const)`, "/src/a.mts")).toContain(
        "css(_kiln$0)",
      );
      // `<T>x` is JSX in .tsx, so it only parses as a type assertion when the extension says .ts.
      expect(compile(`import { css } from 'kiln'\ncss(<any>{ color: 'red' })`, "/src/a.tsx")).toBeUndefined();
      expect(compile(`import { css } from 'kiln'\ncss(<any>{ color: 'red' })`, "/src/a.ts")).toContain("css(_kiln$0)");
      expect(compile(`import { css } from 'kiln'\ncss({ color: <const>'red' })`, "/src/a.ts")).toContain(
        "css(_kiln$0)",
      );
    });

    it("inserts the import after every directive, including with comments before them", () => {
      const output = compile(
        `// header\n'use client';\n"use strict";\nexport const A = () => <div css={{ color: 'red' }} />`,
      )!;
      expect(output.startsWith(`// header\n'use client';\n"use strict";\nimport { __k as _kiln$ }`)).toBe(true);
    });

    it("uses the configured import source for the helper", () => {
      const output = compile(`import { css } from '@acme/kiln'\ncss({ color: 'red' })`, "a.js", {
        importSource: "@acme/kiln",
      })!;
      expect(output).toMatch(/^import \{ __k as _kiln\$ \} from "@acme\/kiln";/);
    });
  });

  describe("source maps", async () => {
    const { TraceMap, originalPositionFor, generatedPositionFor } = await import("@jridgewell/trace-mapping");
    const source = [
      `'use client'`,
      `import { css } from 'kiln'`,
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
      expect(originalPositionFor(map, locate("css(_kiln$0)"))).toMatchObject({ line: 3, column: 17 });
      expect(originalPositionFor(map, locate("_kiln$0)"))).toMatchObject({ line: 3, column: 21 });
      expect(generatedPositionFor(map, { source: "/src/a.tsx", line: 4, column: 0 })).toMatchObject(
        locate("export const b"),
      );
    });
  });

  describe("compiled output matches runtime output", async () => {
    const source = await readFile(new URL("../test/fixtures/equivalence.js", import.meta.url), "utf8");
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

    it("compiled every case with a literal key after its last spread or computed key", () => {
      const body = (name: string) =>
        new RegExp(`\\n  ${name}: \\(\\) =>([\\s\\S]*?)(?=\\n  (?://|\\w+: \\(\\) =>)|\\n\\};)`).exec(output.code)![1]!;
      const uncompiled = Object.keys(original.cases).filter((name) => !body(name).includes("_kiln$"));
      expect(uncompiled).toEqual(["spreadLast", "computedLast"]);
    });
  });
}
