// Checks kiln's cascade oracle against Chrome: renders random compositions over the ranked vocabulary with their rules
// in a shuffled order, with copies placed again later, and compares each longhand's computed value in the browser with
// the oracle's. Pseudo-classes cannot be forced without driving the page, so the compositions use media queries and
// attributes only. Not run in CI.
//
//   node scripts/oracle-chrome.ts            # CHROME_PATH overrides the browser found on PATH
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { layerOrder, resolve } from "../packages/kiln/src/core/index.ts";
import { computed, type ElementState } from "../packages/kiln/test/oracle/cascade.ts";
import { RANKED, type Style } from "../packages/kiln/test/oracle/spec.ts";
import { random, randomStyle, shuffled } from "../packages/kiln/test/oracle/vocabulary.ts";
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

const dir = mkdtempSync(path.join(tmpdir(), "kiln-oracle-chrome-"));
let failures = 0;
let checks = 0;
const widths = new Set<number>();
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
    const file = path.join(dir, `${fixture}.html`);
    writeFileSync(
      file,
      `<!doctype html><html><head>${sheets.map((css) => `<style>${css}</style>`).join("")}</head><body>` +
        `<div id="x" class="${className}" ${Object.entries(attributes)
          .map(([name, value]) => `${name}="${value}"`)
          .join(" ")}></div>` +
        `<script>const s=getComputedStyle(document.getElementById("x"));document.body.dataset.result=JSON.stringify(` +
        `${JSON.stringify(LONGHANDS)}.map(p=>[p,s.getPropertyValue(p)]).concat([["width",String(innerWidth)]]))</script></body></html>`,
    );
    for (const width of WIDTHS) {
      const result = spawnSync(
        chrome,
        ["--headless=new", "--disable-gpu", `--window-size=${width},600`, "--dump-dom", pathToFileURL(file).href],
        {
          encoding: "utf8",
        },
      );
      const json = /data-result="([^"]*)"/.exec(result.stdout)?.[1];
      if (!json) throw new Error(`Chrome gave no result: ${result.stderr}`);
      const browser = Object.fromEntries(JSON.parse(json.replaceAll("&quot;", '"')) as [string, string][]);
      widths.add(Number(browser.width));
      const state: ElementState = { classes: new Set(className.split(" ")), width: Number(browser.width), attributes };
      const oracle = computed(sheets, state);
      for (const longhand of LONGHANDS) {
        checks++;
        // A longhand no rule sets keeps the value a plain div has, so a rule the oracle misses still shows up.
        const value = oracle[longhand] ?? (longhand === "color" ? "black" : "0px");
        const expected = longhand === "color" ? colour(value) : value;
        if (browser[longhand] !== expected) {
          failures++;
          console.error(
            `fixture ${fixture} at ${browser.width}px: ${longhand} is ${browser[longhand]} in Chrome, ${expected} in the oracle`,
          );
        }
      }
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
