import { LAYER_ORDER } from "kiln/core";

const LAYERED = /^@layer k(\d+)\{([\s\S]*)\}$/;

// Every sheet declares the whole layer order first, since any of them may be the first to arrive. Rules keep the
// order they are given in within their layer, where it decides between rules of equal specificity.
export function renderSheet(classes: Iterable<string>, textOf: (rule: string) => string): string {
  const layers = new Map<number, string[]>();
  for (const rule of classes) {
    const text = textOf(rule);
    const match = LAYERED.exec(text);
    if (!match) throw new Error(`kiln: rule ${rule} is not in a kiln layer: ${text}`);
    const layer = Number(match[1]);
    if (!layers.has(layer)) layers.set(layer, []);
    layers.get(layer)!.push(match[2]!);
  }
  let css = LAYER_ORDER + "\n";
  for (const layer of [...layers.keys()].sort((a, b) => a - b)) {
    css += `@layer k${layer}{${layers.get(layer)!.join("")}}\n`;
  }
  return css;
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;
  const { compileEntry } = await import("kiln/core");

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
