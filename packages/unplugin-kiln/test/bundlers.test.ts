import { compileEntry, LAYER_ORDER, type Entry } from "kiln/core";
import { describe, expect, it } from "vite-plus/test";

import { bundle, BUNDLERS } from "./helpers/bundle.ts";

// Bundlers reprint code with their own spacing, quotes and trailing semicolons, so compare without them.
const normalise = (code: string) =>
  code
    .replace(/\/\*.*?\*\//gs, "")
    .replace(/\s+/g, "")
    .replaceAll("'", '"')
    .replaceAll(";}", "}");

const compiledEntries: Entry[] = [
  compileEntry("display", "flex"),
  compileEntry("padding", 16),
  compileEntry("@media (min-width: 600px)", { padding: 24 }),
  compileEntry("margin", 0),
  compileEntry("color", "red"),
  compileEntry(":hover", { color: "blue" }),
];

function expectExtracted({ js, css }: { js: string; css: string }) {
  const output = normalise(js);
  const styles = normalise(css);
  expect(styles.startsWith(normalise(LAYER_ORDER))).toBe(true);
  for (const [key, className, rules] of compiledEntries) {
    expect(output).toContain(normalise(JSON.stringify([key, className, []])));
    for (const [, text] of rules) {
      expect(output).not.toContain(normalise(JSON.stringify(text)));
      expect(styles).toContain(normalise(text));
    }
  }
}

describe.each(BUNDLERS)("%s", (bundler) => {
  it("inlines compiled entries with their rules", async () => {
    const { js, css } = await bundle(bundler, {});
    const output = normalise(js);
    for (const entry of compiledEntries) expect(output).toContain(normalise(JSON.stringify(entry)));
    expect(output).not.toContain('display:"flex"');
    expect(output).toContain("color:tone");
    expect(css).toBe("");
  });

  it("extracts rules into a CSS asset that declares the layer order first", async () => {
    expectExtracted(await bundle(bundler, { extract: true }));
  });
});

describe.each(["webpack", "rspack"] as const)("%s with native CSS", (bundler) => {
  it("extracts rules into a CSS asset through an explicit css rule", async () => {
    expectExtracted(await bundle(bundler, { extract: true }, { nativeCSS: "rule" }));
  });
});

describe("rsbuild with Lightning CSS", () => {
  // Lightning CSS folds the leading order statement into the layer blocks after it, so compare the order
  // in which layers are first declared rather than the statement itself.
  const declaredLayers = (css: string) => [
    ...new Set(
      (css.match(/(?<=@layer\s+)[^{;]+/g) ?? []).flatMap((names) => names.split(",").map((name) => name.trim())),
    ),
  ];

  it("extracts rules into a CSS asset that keeps the layer order", async () => {
    const { js, css } = await bundle("rsbuild", { extract: true }, { lightningcss: true });
    expect(declaredLayers(css)).toEqual(declaredLayers(LAYER_ORDER));
    for (const [key, className] of compiledEntries) {
      expect(normalise(js)).toContain(normalise(JSON.stringify([key, className, []])));
      expect(css).toContain("." + className);
    }
  });
});

describe("webpack with its default CSS rules", () => {
  // unplugin's load rule sets `type: "javascript/auto"` and outranks webpack's default `.css` rule,
  // so the virtual CSS module is parsed as JavaScript. A user rule declaring the type wins again.
  it.fails("extracts rules into a CSS asset", async () => {
    expectExtracted(await bundle("webpack", { extract: true }, { nativeCSS: "default" }));
  });
});
