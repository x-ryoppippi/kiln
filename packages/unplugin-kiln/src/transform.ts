import MagicString from "magic-string";
import { parseSync } from "oxc-parser";
import { compileEntry, hash, LAYER_ORDER, type Entry } from "kiln/core";

export interface TransformOptions {
  /** Module the runtime is imported from. */
  importSource?: string;
  /** Compile `css={{...}}` on host elements. */
  cssProp?: boolean;
  /** Emit static rules into a CSS module instead of inserting them at runtime. */
  extract?: boolean;
}

export interface TransformResult {
  code: string;
  map: ReturnType<MagicString["generateMap"]>;
  /** Extracted CSS and the id the module imports it from, when `extract` is on. */
  css?: { id: string; code: string };
}

export const VIRTUAL_PREFIX = "/__kiln/";
const HELPER = "_kiln$";
const QUICK_FILTER = /\bcss\b|\bstyled\b/;
const UNKNOWN = Symbol("unknown");

type Node = { type: string; start: number; end: number; [key: string]: any };

function unwrap(node: Node): Node {
  while (
    node.type === "TSAsExpression" ||
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

function langOf(id: string): "js" | "jsx" | "ts" | "tsx" {
  const extension = /\.([cm]?[jt]sx?)$/.exec(id)?.[1] ?? "tsx";
  if (extension.endsWith("tsx")) return "tsx";
  if (extension.endsWith("ts")) return "ts";
  if (extension.endsWith("jsx")) return "jsx";
  return "jsx";
}

export function transform(code: string, id: string, options: TransformOptions = {}): TransformResult | null {
  const { importSource = "kiln", cssProp = true, extract = false } = options;
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
      const compiledArgs = cssNames.has(node.callee.name)
        ? args
        : styledNames.has(node.callee.name)
          ? args.slice(1, 2)
          : [];
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
  if (extract && extracted.size > 0) {
    const cssId = VIRTUAL_PREFIX + hash(filename) + ".css";
    header += `import ${JSON.stringify(cssId)};\n`;
    cssResult = { id: cssId, code: LAYER_ORDER + "\n" + [...extracted.values()].join("\n") + "\n" };
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
      expect(result.code).toMatch(/import "\/__kiln\/[0-9a-z]+\.css";/);
      expect(result.code).toMatch(/const _kiln\$0 = _kiln\$\(\[\["color","k[0-9a-z]+",\[\]\]\]\);/);
      expect(result.css!.code).toMatch(/^@layer k0,.*;\n@layer k2\{\.k[0-9a-z]+\{color:red\}\}\n$/);
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

  describe("compiled output matches runtime output", async () => {
    const source = await readFile(new URL("../test/fixtures/equivalence.js", import.meta.url), "utf8");
    const output = transform(source, "equivalence.js")!;

    const original = evaluate(source);
    const transformed = evaluate(output.code);
    const classes = (fn: () => [string, unknown]) => new Set(fn()[0].split(" ").filter(Boolean));

    for (const name of Object.keys(original.cases)) {
      it(name, () => {
        expect(classes(transformed.cases[name])).toEqual(classes(original.cases[name]));
      });
    }

    it("actually compiled the literal cases", () => {
      expect(output.code.match(/_kiln\$\(/g)!.length).toBeGreaterThanOrEqual(10);
    });
  });
}
