/**
 * Record each rule's text under its class name in `registry`, and fail when a class name already stands for another
 * rule. A class name is a hash of its rule, so two rules can share one, and a page would then only get one of them.
 */
export function claim(
  registry: Map<string, string>,
  rules: Iterable<readonly [className: string, text: string]>,
  where?: { id: string; ids: Map<string, string> },
): void {
  for (const [className, text] of rules) {
    const known = registry.get(className);
    if (known === undefined) {
      registry.set(className, text);
      where?.ids.set(className, where.id);
      continue;
    }
    if (known === text) continue;
    const from = where?.ids.get(className);
    const places = where && from !== undefined ? ` (in ${from} and ${where.id})` : "";
    throw new Error(
      `[nishiki] the rules ${known} and ${text}${places} have the same class name, ${className}, so a page would get ` +
        `only one of them. nishiki names a rule after a hash of it; write one of these values another way that means ` +
        `the same, such as with other units, to give it another name.`,
    );
  }
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;
  const { compileEntry } = await import("../core/index.ts");

  describe("claim", () => {
    // djb2 hashes these two rules alike.
    const ruleOfHeight = (value: string) => compileEntry("height", value)[0]![2][0]!;
    const [taller, shorter] = [ruleOfHeight("7044px"), ruleOfHeight("2100.11rem")];

    it("records each rule, and lets a rule come again", () => {
      const registry = new Map<string, string>();
      claim(registry, [taller, taller]);
      expect(registry).toEqual(new Map([taller]));
    });

    it("fails when two rules have the same class name, naming both and where they come from", () => {
      expect(taller[0]).toBe(shorter[0]);
      const where = { id: "/src/a.tsx", ids: new Map<string, string>() };
      const registry = new Map<string, string>();
      claim(registry, [taller], where);
      expect(() => claim(registry, [shorter], { ...where, id: "/src/b.tsx" })).toThrow(
        `[nishiki] the rules ${taller[1]} and ${shorter[1]} (in /src/a.tsx and /src/b.tsx) have the same class name, ` +
          `${taller[0]}`,
      );
      expect(() => claim(new Map([taller]), [shorter])).toThrow(/^\[nishiki\] the rules .* have the same class name/);
    });
  });
}
