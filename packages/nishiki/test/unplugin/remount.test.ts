// @vitest-environment happy-dom
// Whether a render inserts rules, sets custom properties or does neither must not change the tree React reconciles, or
// React remounts the element when a value moves between them, losing its focus and what was typed into it. React
// unwraps a fragment that is the only child, so each element renders after a sibling.
import { readFile } from "node:fs/promises";
import path from "node:path";

import { transformSync } from "esbuild";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { compileModule } from "../../src/unplugin/transform.ts";
import { evaluate } from "./helpers/evaluate.ts";

const source = await readFile(path.join(import.meta.dirname, "fixtures/remount.jsx"), "utf8");
const run = (code: string) =>
  evaluate(transformSync(code, { loader: "jsx", jsx: "automatic", jsxImportSource: "@nishikijs/react" }).code);

// A custom property, a keyword the custom property cannot carry, nothing, and back.
const TONES = ["red", "inherit", undefined, "blue", null, "initial", "red"];

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLElement;
beforeEach(() => {
  container = document.body.appendChild(document.createElement("div"));
});
afterEach(() => container.remove());

describe.each([
  { name: "the runtime", compile: undefined },
  ...[false, true].flatMap((extract) =>
    [false, true].map((lean) => ({
      name: `the compiler with ${JSON.stringify({ extract, lean })}`,
      compile: { extract, lean },
    })),
  ),
])("an element styled through $name", ({ compile }) => {
  const code = compile
    ? compileModule(
        source,
        "/src/remount.jsx",
        { extract: compile.extract },
        { cssImport: false, configImport: false, lean: compile.lean },
      )!.code
    : source;
  const cases = run(code).cases as Record<string, (tone: unknown) => React.ReactNode>;

  it.each(Object.keys(cases))("%s keeps its DOM node as its value changes", (name) => {
    const root = createRoot(container);
    const render = (tone: unknown) =>
      React.act(() => root.render(React.createElement("form", null, React.createElement("label"), cases[name]!(tone))));
    render(TONES[0]);
    const input = container.querySelector("input")!;
    input.value = "typed";
    input.focus();
    for (const tone of TONES.slice(1)) {
      render(tone);
      const label = `${name}(${JSON.stringify(tone)})`;
      expect(container.querySelector("input"), label).toBe(input);
      expect(input.value, label).toBe("typed");
      expect(document.activeElement, label).toBe(input);
    }
    React.act(() => root.unmount());
  });
});
