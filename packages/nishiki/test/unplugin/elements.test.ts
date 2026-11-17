// The css prop and styled components render the same markup and rules compiled as at runtime, whichever way the
// compiler compiles them: in place, to class names with extract, and against the lean or the full runtime.
import { readFile } from "node:fs/promises";

import { transformSync } from "esbuild";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { layerOrder } from "../../src/core/index.ts";
import { compileModule } from "../../src/unplugin/transform.ts";
import { computedElements } from "./helpers/computed.ts";
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

// The markup without the styles React hoists, the rules those styles insert by class, and what each element computes.
function render(element: React.ReactNode, extracted: Iterable<string> = []) {
  const html = renderToString(React.createElement(React.Fragment, null, element));
  const rules = rulesIn([...html.matchAll(STYLE)].map(([, text]) => text!).join(""));
  const computed = computedElements(html, [layerOrder(), ...rules.values(), ...extracted]);
  return { markup: html.replace(STYLE, ""), rules, computed };
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

describe("elements compiled against React's JSX runtime", () => {
  const plain = `import { styled } from "@nishikijs/react";
const Base = styled("button", { color: "red" });
export const ref = () => {};
export const render = (own) => (
  <main css={{ padding: 8, ":hover": { color: "blue" } }}>
    <Base className={own}>go</Base>
    <p className={own} css={{ margin: 0 }} />
    <input ref={ref} className="own" css={{ width: 1 }} />
  </main>
);`;
  const before = run(plain);
  const result = compileModule(
    plain,
    "/src/plain.jsx",
    { extract: true },
    { cssImport: false, configImport: false, lean: true },
  )!;
  const after = run(result.code);

  it("leaves no element that takes a css prop", () => {
    expect(result.code.startsWith("/** @jsxImportSource react */\n")).toBe(true);
    expect(result.code).not.toMatch(/\bcss=/);
  });

  it.each(["own", undefined])("renders as the runtime does with className %s", (own) => {
    const expected = render(before.render(own));
    const actual = render(after.render(own));
    expect(actual.markup).toBe(expected.markup);
    for (const className of classesIn(expected.markup)) {
      expect(actual.rules.get(className) ?? new Map(result.rules).get(className)).toBe(expected.rules.get(className));
    }
    expect(refsIn(after.render(own), after.ref)).toEqual(refsIn(before.render(own), before.ref));
  });
});

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
      const actual = render(compiled.cases[name](), extracted.values());
      // A runtime value an element sets as a custom property gives it other class names, but the same computed styles.
      if (actual.markup.includes("--n-")) {
        expect(name).toBe("dynamic");
        expect(actual.markup.replace(/ (?:class|style)="[^"]*"/g, "")).toBe(
          expected.markup.replace(/ class="[^"]*"/g, ""),
        );
        return expect(actual.computed).toEqual(expected.computed);
      }
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
    // A list of literal styles, nested lists and skipped items included, compiles too.
    expect(result.code).toMatch(/<div className="own n[0-9a-z]+ n[0-9a-z]+" \/>/);
    expect(result.code).toContain(`<i id="l" />`);
    // The runtime leaves `css={null}` on the element.
    expect(result.code).toContain(`<i css={null} id="n" />`);
    // A spread may hold a className or css of its own, and a component reads the css prop itself.
    expect(result.code).toMatch(/<div \{\.\.\.\{ id: "s", className: "spread" \}\} css=\{_nishiki\$\d+\} \/>/);
    expect(result.code).toMatch(/<Box css=\{_nishiki\$\d+\} id="c" \/>/);
  });
});
