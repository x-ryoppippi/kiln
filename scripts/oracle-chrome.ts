// Checks nishiki's cascade oracle against Chrome: renders random compositions over the ranked vocabulary with their rules
// in a shuffled order, with copies placed again later, and compares each longhand's computed value in the browser with
// the oracle's. Pseudo-classes cannot be forced without driving the page, so the compositions use media queries and
// attributes only. Then the same for runtime values a compiled module sets as custom properties, on a parent and its
// child, which also have to compute in Chrome what the rules the runtime formats for the same values do. Not run in CI.
//
//   node scripts/oracle-chrome.ts            # CHROME_PATH overrides the browser found on PATH
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  compiled,
  compileEntry,
  layerOrder,
  resolve,
  takesPx,
  variableName,
  type StyleInput,
} from "../packages/nishiki/src/core/index.ts";
import { variable } from "../packages/nishiki/src/core/resolve.ts";
import { computed, type ElementState } from "../packages/nishiki/test/oracle/cascade.ts";
import { NARROWNESS, RANKED, type Style } from "../packages/nishiki/test/oracle/spec.ts";
import { pick, random, randomStyle, shuffled } from "../packages/nishiki/test/oracle/vocabulary.ts";
import { findChrome } from "./bench/browser.ts";

const FIXTURES = 20;
const WIDTHS = [500, 700, 900, 1200];
const LONGHANDS = [
  "color",
  ...["padding", "margin"].flatMap((box) => ["top", "right", "bottom", "left"].map((side) => `${box}-${side}`)),
];

const chrome = findChrome();
if (!chrome) throw new Error("no Chrome or Chromium found; set CHROME_PATH");

// Without pseudo-classes or the colour scheme, which a page cannot switch without driving the browser.
const withoutPseudo = (style: Style): Style =>
  Object.fromEntries(
    Object.entries(style)
      .filter(([key]) => !/^&?:/.test(key) && key !== "@media (prefers-color-scheme: dark)")
      .map(([key, value]) => [key, value && typeof value === "object" ? withoutPseudo(value as Style) : value])
      .filter(([, value]) => !(value && typeof value === "object" && Object.keys(value).length === 0)),
  );

interface Element {
  className: string;
  attributes?: Record<string, string>;
  style?: Readonly<Record<string, string | number>>;
}

const dir = mkdtempSync(path.join(tmpdir(), "nishiki-oracle-chrome-"));
let failures = 0;
let checks = 0;
const widths = new Set<number>();
const fail = (message: string) => {
  failures++;
  console.error(message);
};

// What Chrome computes for each of a page's elements, each the child of the one before it, at a window width.
function render(name: string, sheets: readonly string[], elements: readonly Element[], width: number) {
  const file = path.join(dir, `${name}.html`);
  const open = elements.map(({ className, attributes = {}, style = {} }, index) => {
    const attrs = Object.entries(attributes).map(([attribute, value]) => ` ${attribute}="${value}"`);
    const inline = Object.entries(style).map(([property, value]) => `${property}:${value}`);
    return `<div id="e${index}" class="${className}"${attrs.join("")} style="${inline.join(";")}">`;
  });
  writeFileSync(
    file,
    `<!doctype html><html><head>${sheets.map((css) => `<style>${css}</style>`).join("")}</head><body>` +
      open.join("") +
      "</div>".repeat(elements.length) +
      `<script>document.body.dataset.result=JSON.stringify({width:innerWidth,elements:` +
      `[...document.querySelectorAll("[id^=e]")].map(e=>{const s=getComputedStyle(e);` +
      `return Object.fromEntries(${JSON.stringify(LONGHANDS)}.map(p=>[p,s.getPropertyValue(p)]))})})</script>` +
      `</body></html>`,
  );
  const result = spawnSync(
    chrome!,
    ["--headless=new", "--disable-gpu", `--window-size=${width},600`, "--dump-dom", pathToFileURL(file).href],
    { encoding: "utf8" },
  );
  const json = /data-result="([^"]*)"/.exec(result.stdout)?.[1];
  if (!json) throw new Error(`Chrome gave no result: ${result.stderr}`);
  const page = JSON.parse(json.replaceAll("&quot;", '"')) as { width: number; elements: Record<string, string>[] };
  widths.add(page.width);
  return page;
}

// What the oracle computes for the same elements, each inheriting from the one before it.
function oracle(sheets: readonly string[], elements: readonly Element[], width: number) {
  let parent: Record<string, string> | undefined;
  return elements.map(({ className, attributes, style }) => {
    const state: ElementState = {
      classes: new Set(className.split(" ")),
      width,
      attributes,
      style: style && Object.fromEntries(Object.entries(style).map(([property, value]) => [property, String(value)])),
      parent,
    };
    return (parent = computed(sheets, state));
  });
}

// A longhand no rule sets keeps the value a plain div has, so a rule the oracle misses still shows up.
const expectedValue = (longhand: string, value: string | undefined) =>
  longhand === "color" ? colour(value ?? "black") : (value ?? "0px");

function compare(
  label: string,
  browser: readonly Record<string, string>[],
  expected: readonly Record<string, string>[],
) {
  browser.forEach((values, index) => {
    for (const longhand of LONGHANDS) {
      checks++;
      const want = expectedValue(longhand, expected[index]![longhand]);
      if (values[longhand] !== want) {
        fail(`${label}, element ${index}: ${longhand} is ${values[longhand]} in Chrome, ${want} in the oracle`);
      }
    }
  });
}

try {
  const rnd = random(0x5eed);
  for (let fixture = 0; fixture < FIXTURES; fixture++) {
    const styles = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => withoutPseudo(randomStyle(rnd, RANKED[0])));
    const [className, rules] = resolve(styles);
    const sheets = [
      layerOrder(),
      ...shuffled(
        rnd,
        rules.map(([, text]) => text),
      ),
    ];
    const attributes = { "aria-expanded": "true", "aria-selected": rnd() < 0.5 ? "true" : "false" };
    for (const width of WIDTHS) {
      const element = { className, attributes };
      const browser = render(`${fixture}`, sheets, [element], width);
      compare(`fixture ${fixture} at ${browser.width}px`, browser.elements, oracle(sheets, [element], browser.width));
    }
  }

  // Runtime values set as custom properties, which the parent's custom properties must not leak into the child's, and
  // a custom property of the page's own, which an empty value declares, read by `margin-top` with a fallback.
  const KEYS = [...Object.keys(NARROWNESS), "--g"];
  const SHORTHANDS = new Set(["padding", "margin", "paddingInline", "paddingBlock", "marginInline"]);
  const valueOf = (key: string): unknown =>
    rnd() < 0.3
      ? pick(rnd, [undefined, null, false, ""])
      : key === "color"
        ? pick(rnd, ["red", "blue", "green"])
        : key === "--g"
          ? pick(rnd, ["", "2px", "5px"])
          : pick(rnd, [0, 1, 4, 8, "2px", ...(SHORTHANDS.has(key) ? ["1px 3px"] : [])]);
  const variables = new Map(
    KEYS.map((key) => [
      key,
      variable(
        compiled(compileEntry(key, `var(${variableName(key)})`)),
        variableName(key),
        takesPx(key) ? 1 : undefined,
      ),
    ]),
  );
  // An element's styles: runtime values of some keys, literals of others, and a breakpoint over them.
  const dynamicStyles = () => {
    const runtime: Record<string, unknown> = {};
    for (let count = 1 + Math.floor(rnd() * 4); count > 0; count--) {
      const key = pick(rnd, KEYS);
      runtime[key] = valueOf(key);
    }
    const key = pick(rnd, KEYS.slice(0, -1));
    const literal = {
      marginTop: "var(--g, 1px)",
      ...(rnd() < 0.5 ? { "@media (min-width: 40rem)": { [key]: key === "color" ? "green" : 16 } } : {}),
    };
    return { literal, runtime };
  };
  for (let fixture = 0; fixture < FIXTURES; fixture++) {
    const tree = [dynamicStyles(), dynamicStyles()];
    // As compiled: each runtime value through the custom property of its key; and as the runtime compiles the same.
    const asVariables = tree.map(({ literal, runtime }) =>
      resolve([
        literal,
        Object.fromEntries(Object.entries(runtime).map(([key, value]) => [key, variables.get(key)!(value)])),
      ] satisfies StyleInput[]),
    );
    const asRules = tree.map(({ literal, runtime }) => resolve([literal, runtime as StyleInput]));
    const sheetsOf = (resolved: typeof asRules) => [
      layerOrder(),
      ...shuffled(
        rnd,
        resolved.flatMap(([, rules]) => rules.map(([, text]) => text)),
      ),
    ];
    const elementsOf = (resolved: typeof asRules): Element[] =>
      resolved.map(([className, , style]) => ({ className, style }));
    for (const width of [500, 900]) {
      const label = `runtime values ${fixture} (${JSON.stringify(tree)}) at ${width}px`;
      const results = [asVariables, asRules].map((resolved) => {
        const sheets = sheetsOf(resolved);
        const browser = render(`dynamic-${fixture}`, sheets, elementsOf(resolved), width);
        compare(label, browser.elements, oracle(sheets, elementsOf(resolved), browser.width));
        return browser.elements;
      });
      results[0]!.forEach((values, index) => {
        for (const longhand of LONGHANDS) {
          checks++;
          if (values[longhand] !== results[1]![index]![longhand]) {
            fail(
              `${label}, element ${index}: ${longhand} is ${values[longhand]} through custom properties, ` +
                `${results[1]![index]![longhand]} through rules`,
            );
          }
        }
      });
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
// The window size sets the viewport width, which the media queries read; a browser that ignored it compared nothing.
if (widths.size < WIDTHS.length) throw new Error(`Chrome rendered at ${[...widths].join(", ")}px only`);
console.log(`${checks} computed values compared at ${[...widths].join(", ")}px, ${failures} differ`);
if (failures > 0) process.exitCode = 1;

function colour(name: string): string {
  return (
    { black: "rgb(0, 0, 0)", red: "rgb(255, 0, 0)", blue: "rgb(0, 0, 255)", green: "rgb(0, 128, 0)" }[name] ?? name
  );
}
