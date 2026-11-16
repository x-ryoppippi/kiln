import { layerName, rankOfLayer } from "../../core/index.ts";

const LAYERED = /^@layer (n[0-9a-z]+)((?:\.a)*)\{([\s\S]*)\}$/;

// The top-level layer of a rule, how deep inside it the rule sits, and the rest of its text.
function layered(rule: string, text: string): [rank: number, depth: number, body: string] {
  const match = LAYERED.exec(text);
  if (!match) throw new Error(`nishiki: rule ${rule} is not in a nishiki layer: ${text}`);
  return [rankOfLayer(match[1]!), match[2]!.length / 2, match[3]!];
}

// The statement declaring, in rank order, the top-level layers that `texts` use.
export function usedOrder(texts: Iterable<string>): string {
  const ranks = new Set<number>();
  for (const text of texts) ranks.add(layered("", text)[0]);
  return (
    "@layer " +
    [...ranks]
      .sort((a, b) => a - b)
      .map((rank) => layerName(rank))
      .join(",") +
    ";"
  );
}

// A sheet that may be the first nishiki sheet on the page starts with `order`; any other leaves it out, since a sheet
// declaring it has always loaded by then. Rules keep the order they are given in within their layer, which only
// matters between rules that tie there.
export function renderSheet(classes: Iterable<string>, textOf: (rule: string) => string, order: string | null): string {
  const layers = new Map<string, [rank: number, depth: number, bodies: string[]]>();
  for (const rule of classes) {
    const [rank, depth, body] = layered(rule, textOf(rule));
    const name = layerName(rank, depth);
    if (!layers.has(name)) layers.set(name, [rank, depth, []]);
    layers.get(name)![2].push(body);
  }
  let css = order ? order + "\n" : "";
  const sorted = [...layers].sort(([, [a, x]], [, [b, y]]) => a - b || y - x);
  for (const [name, [, , bodies]] of sorted) css += `@layer ${name}{${bodies.join("")}}\n`;
  return css;
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;
  const { compileEntry } = await import("../../core/index.ts");

  const rulesOf = (...entries: ReturnType<typeof compileEntry>) => entries.flatMap(([, , list]) => list);
  const nameOf = (text: string) => /^@layer ([^{]+)\{/.exec(text)![1]!;

  describe("renderSheet", () => {
    it("declares the order it is given, then one block per layer in rank order, broader properties first", () => {
      const rules = new Map(
        rulesOf(
          ...compileEntry(":hover", { color: "blue" }),
          ...compileEntry("marginTop", 4),
          ...compileEntry("margin", 0),
          ...compileEntry("color", "red"),
          ...compileEntry("@media (min-width: 40rem)", { ":focus": { padding: 1 } }),
        ),
      );
      const order = usedOrder(rules.values());
      expect(order).toMatch(/^@layer n0,n[0-9a-z]+,n[0-9a-z]+;$/);
      const css = renderSheet([...rules.keys()].reverse(), (rule) => rules.get(rule)!, order);
      const [first, ...blocks] = css.trimEnd().split("\n");
      expect(first).toBe(order);
      const [hover, compound] = order.slice("@layer n0,".length, -1).split(",");
      expect(blocks.map(nameOf)).toEqual(["n0.a.a.a", "n0", hover, compound + ".a.a.a"]);
      expect(blocks[3]).toContain("@media (min-width: 40rem){");
    });

    it("leaves the order out of a sheet that never loads first", () => {
      const [rule, text] = rulesOf(...compileEntry("color", "red"))[0]!;
      expect(renderSheet([rule], () => text, null)).toBe(text + "\n");
    });

    it("keeps the given order within a layer", () => {
      const tied = rulesOf(
        ...compileEntry("@media (min-width: 600px)", { padding: 8 }),
        ...compileEntry("@media (min-width: 900px)", { padding: 16 }),
      );
      expect(new Set(tied.map(([, text]) => nameOf(text))).size).toBe(1);
      const text = new Map(tied);
      for (const given of [tied, [...tied].reverse()]) {
        const css = renderSheet(
          given.map(([rule]) => rule),
          (rule) => text.get(rule)!,
          null,
        );
        const at = (rule: string) => css.indexOf(`.${rule}{`);
        expect(at(given[0]![0])).toBeLessThan(at(given[1]![0]));
      }
    });

    it("refuses a rule outside nishiki's layers", () => {
      expect(() => renderSheet(["x"], () => ".x{color:red}", null)).toThrow(/not in a nishiki layer/);
    });
  });
}
