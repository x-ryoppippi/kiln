// The css prop and styled components render the same markup and rules compiled as at runtime, whichever way the
// compiler compiles them: in place, to class names with extract, and against the lean or the full runtime.
import { readFile } from "node:fs/promises";

import { transformSync } from "esbuild";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { compileModule } from "../../src/unplugin/transform.ts";
import { evaluate } from "./helpers/evaluate.ts";

const source = await readFile(new URL("fixtures/elements.jsx", import.meta.url), "utf8");
const run = (code: string) =>
  evaluate(transformSync(code, { loader: "jsx", jsx: "automatic", jsxImportSource: "@nishikijs/react" }).code);
const original = run(source);

const STYLE = /<style[^>]*>(.*?)<\/style>/gs;

// The top-level rules of a stylesheet, by the class each styles; React joins the rules of one precedence in one style.
function rulesIn(css: string): Map<string, string> {
  const rules = new Map<string, string>();
  let depth = 0;
  let start = 0;
  for (let index = 0; index < css.length; index++) {
    if (css[index] === "{") depth++;
    else if (css[index] === "}" && --depth === 0) {
      const rule = css.slice(start, index + 1);
      const className = /\.(n[0-9a-z]+)/.exec(rule.slice(rule.indexOf("{")))?.[1];
      if (className) rules.set(className, rule);
      start = index + 1;
    }
  }
  return rules;
}

// The markup without the styles React hoists, and the rules those styles insert by class.
function render(element: React.ReactNode) {
  const html = renderToString(React.createElement(React.Fragment, null, element));
  const rules = rulesIn([...html.matchAll(STYLE)].map(([, text]) => text!).join(""));
  return { markup: html.replace(STYLE, ""), rules };
}

const classesIn = (markup: string) =>
  [...markup.matchAll(/class="([^"]*)"/g)]
    .flatMap(([, value]) => value!.split(" "))
    .filter((name) => name.startsWith("n"));

// The host elements a tree renders that carry a ref, expanding components as React would.
function refsIn(node: unknown, ref: unknown): [type: string, className: unknown][] {
  if (Array.isArray(node)) return node.flatMap((child) => refsIn(child, ref));
  if (!React.isValidElement(node)) return [];
  const { type, props } = node as React.ReactElement<Record<string, unknown>>;
  if (typeof type === "function") return refsIn((type as (props: object) => unknown)(props), ref);
  if (typeof type !== "string") return refsIn(props.children, ref);
  return [...(props.ref === ref ? [[type, props.className] as [string, unknown]] : []), ...refsIn(props.children, ref)];
}

describe.each([
  { extract: false, lean: false },
  { extract: false, lean: true },
  { extract: true, lean: false },
  { extract: true, lean: true },
])("elements compiled with %o", ({ extract, lean }) => {
  const result = compileModule(
    source,
    "/src/elements.jsx",
    { extract },
    { cssImport: false, configImport: false, lean },
  )!;
  const compiled = run(result.code);
  const extracted = new Map(result.rules);

  for (const name of Object.keys(original.cases)) {
    it(`renders ${name} as the runtime does`, () => {
      const expected = render(original.cases[name]());
      const actual = render(compiled.cases[name]());
      expect(actual.markup).toBe(expected.markup);
      for (const className of classesIn(expected.markup)) {
        expect(actual.rules.get(className) ?? extracted.get(className), className).toBe(expected.rules.get(className));
      }
    });
  }

  it("passes refs through to the element", () => {
    const expected = refsIn(original.cases.refs(), original.ref);
    expect(expected).toHaveLength(3);
    expect(refsIn(compiled.cases.refs(), compiled.ref)).toEqual(expected);
  });

  it.runIf(extract)("compiles a static css prop on a host element to class names", () => {
    expect(result.code).toContain(`<a href="/x" id="link" className="n`);
    expect(result.code).toMatch(/<p className="own n[0-9a-z]+" \/>/);
    expect(result.code).toMatch(/<p className=\{_nishiki\$j\(own, "n[0-9a-z]+ n[0-9a-z]+"\)\} \/>/);
    expect(result.code).toContain(`<i id="e" />`);
    // A spread may hold a className or css of its own, and a component reads the css prop itself.
    expect(result.code).toMatch(/<div \{\.\.\.\{ id: "s", className: "spread" \}\} css=\{_nishiki\$\d+\} \/>/);
    expect(result.code).toMatch(/<Box css=\{_nishiki\$\d+\} id="c" \/>/);
  });
});
