// Runtime values that reach an element compile to one static rule per property, which reads a custom property the
// element sets inline. Whichever way the compiler compiles them, every element computes what the runtime's rules make it
// compute, inheritance from its parent included.
import { readFile } from "node:fs/promises";

import { transformSync } from "esbuild";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { layerOrder } from "../../src/core/index.ts";
import { compileModule } from "../../src/unplugin/transform.ts";
import { computedElements, inlineStyle } from "./helpers/computed.ts";
import { evaluate } from "./helpers/evaluate.ts";

const source = await readFile(new URL("fixtures/variables.jsx", import.meta.url), "utf8");
const run = (code: string) =>
  evaluate(transformSync(code, { loader: "jsx", jsx: "automatic", jsxImportSource: "@nishikijs/react" }).code);
const original = run(source);
const cases = Object.entries(original.cases as Record<string, [unknown[], (value: unknown) => React.ReactNode]>);

const STYLE = /<style[^>]*>(.*?)<\/style>/gs;
const render = (element: React.ReactNode) => renderToString(React.createElement(React.Fragment, null, element));
const sheetsOf = (html: string, extracted: Iterable<string> = []) => [
  layerOrder(),
  ...[...html.matchAll(STYLE)].map(([, text]) => text!),
  ...extracted,
];
// A wide viewport at rest, and a narrow one under the pointer.
const STATES = [{ width: 1000 }, { width: 500, pseudo: new Set(["hover"]) }];

describe.each([
  { extract: false, lean: false },
  { extract: false, lean: true },
  { extract: true, lean: false },
  { extract: true, lean: true },
])("runtime values compiled with %o", ({ extract, lean }) => {
  const result = compileModule(
    source,
    "/src/variables.jsx",
    { extract },
    { cssImport: false, configImport: false, lean },
  )!;
  const compiled = run(result.code);
  const extracted = new Map(result.rules);

  it("sets them as custom properties, never formatting a rule per value", () => {
    expect(result.code).not.toMatch(/_nishiki\$[vf]\(/);
    expect(result.code).toMatch(/_nishiki\$d\(_nishiki\$\d+, "--n-padding", 1\)/);
    expect(result.code).toMatch(/_nishiki\$d\(_nishiki\$\d+, "--n-line-height"\)/);
    expect(result.fallback).toBeUndefined();
  });

  for (const [name, [values]] of cases) {
    it(`computes ${name} as the runtime does, for every value`, () => {
      for (const value of values) {
        const label = `${name}(${JSON.stringify(value)})`;
        const expectedHtml = render(original.cases[name][1](value));
        const actualHtml = render(compiled.cases[name][1](value));
        for (const state of STATES) {
          expect(computedElements(actualHtml, sheetsOf(actualHtml, extracted.values()), state), label).toEqual(
            computedElements(expectedHtml, sheetsOf(expectedHtml), state),
          );
        }
      }
    });
  }

  it("inserts no rule for any value that one value does not insert", () => {
    const rulesOf = (name: string, values: readonly unknown[]) =>
      new Set(
        values.flatMap((value) =>
          [...render(compiled.cases[name][1](value)).matchAll(STYLE)].flatMap(([, text]) =>
            rulesIn(text!).map(([, rule]) => rule),
          ),
        ),
      );
    for (const [name, [values]] of cases) expect(rulesOf(name, values), name).toEqual(rulesOf(name, [4]));
  });

  it("gives the element the class of a property only where it sets the custom property that class reads", () => {
    const html = render(compiled.cases.inheritance[1](8));
    const elements = [...html.replace(STYLE, "").matchAll(/<(\w+) class="([^"]*)"(?: style="([^"]*)")?/g)];
    const rulesByClass = new Map([...extracted, ...[...html.matchAll(STYLE)].flatMap(([, text]) => rulesIn(text!))]);
    expect(elements.map(([, tag]) => tag)).toEqual(["section", "div", "i", "b"]);
    for (const [, tag, className, style = ""] of elements) {
      const reads = className!
        .split(" ")
        .flatMap((name) =>
          [...(rulesByClass.get(name) ?? "").matchAll(/var\((--n-[\w-]+)\)/g)].map(([, read]) => read!),
        );
      expect(reads.sort(), tag).toEqual(Object.keys(inlineStyle(style)).sort());
    }
  });
});

// The top-level rules of a stylesheet, by the class each styles.
function rulesIn(css: string): [className: string, rule: string][] {
  const rules: [string, string][] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < css.length; index++) {
    if (css[index] === "{") depth++;
    else if (css[index] === "}" && --depth === 0) {
      const rule = css.slice(start, index + 1);
      const className = /\.(n[0-9a-z]+)/.exec(rule.slice(rule.indexOf("{")))?.[1];
      if (className) rules.push([className, rule]);
      start = index + 1;
    }
  }
  return rules;
}
