import { isLonghandLayer, LAYER_ORDER } from "../../core/index.ts";

const LAYERED = /^@layer k(\d+)\{([\s\S]*)\}$/;

// The layer a rule's text puts it in, and the text inside that layer.
export function layered(rule: string, text: string): { layer: number; body: string } {
  const match = LAYERED.exec(text);
  if (!match) throw new Error(`kiln: rule ${rule} is not in a kiln layer: ${text}`);
  return { layer: Number(match[1]), body: match[2]! };
}

const DIRECTIONS = new Set(["top", "right", "bottom", "left", "block", "inline", "start", "end", "x", "y"]);

// The property a longhand sets under every name it may go by: physical and logical sides and sizes, which the writing
// mode maps onto each other, vendor prefixes and legacy aliases.
function familyOf(property: string): string {
  if (property.startsWith("--")) return property;
  const name = property
    .replace(/^-(?:webkit|moz|ms|o)-/, "")
    .replace(/^word-wrap$/, "overflow-wrap")
    .replace(/^grid-(?=(?:row-|column-)?gap$)/, "")
    .replace(/^page-break-/, "break-");
  const words = name.split("-").filter((word) => !DIRECTIONS.has(word));
  return words.map((word) => (word === "width" || word === "height" ? "size" : word)).join("-") || "inset";
}

// Rules of different groups never decide the same property of one element between them, so only within a group does
// their order across sheets matter. A longhand groups with the longhands that may set its property; a shorthand
// layer is one group, since its shorthands overlap.
export function groupOf(rule: string, text: string): string {
  const { layer, body } = layered(rule, text);
  const property = isLonghandLayer(layer) ? /\{([^{}:]+):[^{}]*\}+$/.exec(body)?.[1] : undefined;
  return property ? `${layer}:${familyOf(property.trim())}` : `${layer}`;
}

// Every sheet declares the whole layer order first, since any of them may be the first to arrive. Rules keep the
// order they are given in within their layer, where it decides between rules of equal specificity.
export function renderSheet(classes: Iterable<string>, textOf: (rule: string) => string): string {
  const layers = new Map<number, string[]>();
  for (const rule of classes) {
    const { layer, body } = layered(rule, textOf(rule));
    if (!layers.has(layer)) layers.set(layer, []);
    layers.get(layer)!.push(body);
  }
  let css = LAYER_ORDER + "\n";
  for (const layer of [...layers.keys()].sort((a, b) => a - b)) {
    css += `@layer k${layer}{${layers.get(layer)!.join("")}}\n`;
  }
  return css;
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;
  const { compileEntry } = await import("../../core/index.ts");

  describe("renderSheet", () => {
    it("declares the layer order, then one block per layer in numeric order", () => {
      const rules = new Map(
        [
          compileEntry(":hover", { color: "blue" }),
          compileEntry("marginTop", 4),
          compileEntry("margin", 0),
          compileEntry("color", "red"),
          compileEntry("@media (min-width: 600px)", { ":focus": { padding: 1 } }),
        ].flatMap(([, , list]) => list),
      );
      const css = renderSheet([...rules.keys()].reverse(), (rule) => rules.get(rule)!);
      const [order, ...blocks] = css.trimEnd().split("\n");
      expect(order).toBe(LAYER_ORDER);
      expect(blocks.map((block) => /^@layer (k\d+)\{/.exec(block)![1])).toEqual(["k0", "k2", "k5", "k6"]);
      expect(blocks[3]).toContain("@media (min-width: 600px){");
    });

    it("keeps the given order within a layer, where the later of two overlapping media queries wins", () => {
      const conditional = [
        compileEntry("@media (min-width: 600px)", { padding: 8 }),
        compileEntry("@media (min-width: 900px)", { padding: 16 }),
      ].flatMap(([, , list]) => list);
      expect(new Set(conditional.map(([, text]) => text.slice(0, 10))).size).toBe(1);
      const text = new Map(conditional);
      for (const given of [conditional, [...conditional].reverse()]) {
        const css = renderSheet(
          given.map(([rule]) => rule),
          (rule) => text.get(rule)!,
        );
        const at = (rule: string) => css.indexOf(`.${rule}{`);
        expect(at(given[0]![0])).toBeLessThan(at(given[1]![0]));
      }
    });

    it("refuses a rule outside kiln's layers", () => {
      expect(() => renderSheet(["x"], () => ".x{color:red}")).toThrow(/not in a kiln layer/);
    });
  });
}
