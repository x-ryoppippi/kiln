import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { transform } from "../src/transform.ts";
import { evaluate } from "./helpers/evaluate.ts";

const fixtures = join(import.meta.dirname, "fixtures");

const compile = (code: string, id = "file.tsx", options = {}) => transform(code, id, options)?.code;

describe("transform", () => {
  it("compiles a static css prop and imports the helper", () => {
    const output = compile(`export const A = () => <div css={{ color: 'red' }} />`)!;
    expect(output).toMatch(/^import \{ __k as _kiln\$ \} from "kiln";/);
    expect(output).toMatch(/css=\{_kiln\$\(\[\["color","k[0-9a-z]+",\[\["k[0-9a-z]+","@layer k2\{/);
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
    expect(output).toContain(`s('button', _kiln$(`);
  });

  it("compiles through TypeScript wrappers", () => {
    const output = compile(`import { css } from 'kiln'\ncss({ color: 'red' } as const)`, "a.ts")!;
    expect(output).toContain("css(_kiln$(");
  });

  it("inserts the import after directives", () => {
    const output = compile(`'use client'\nexport const A = () => <div css={{ color: 'red' }} />`)!;
    expect(output.startsWith(`'use client'\nimport { __k as _kiln$ }`)).toBe(true);
  });

  it("moves rules into a CSS module when extracting", () => {
    const result = transform(`export const A = () => <div css={{ color: 'red' }} />`, "/src/a.tsx", { extract: true })!;
    expect(result.code).toMatch(/import "\/__kiln\/[0-9a-z]+\.css";/);
    expect(result.code).toMatch(/_kiln\$\(\[\["color","k[0-9a-z]+",\[\]\]\]\)/);
    expect(result.css!.code).toMatch(/^@layer k0,.*;\n@layer k2\{\.k[0-9a-z]+\{color:red\}\}\n$/);
  });

  it("skips files that cannot reference the runtime", () => {
    expect(transform(`export const x = 1`, "a.ts")).toBeNull();
  });
});

describe("compiled output matches runtime output", async () => {
  const source = await readFile(join(fixtures, "equivalence.js"), "utf8");
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
