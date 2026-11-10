// Seeded differential fuzzing in the spirit of shadcn-ui/cn packages/conformance/tests/fuzz.mjs:
// random `css()` calls must give the same classes and rules compiled as they do at runtime.
import { describe, expect, it } from "vite-plus/test";

import { transform } from "../src/transform.ts";
import { evaluate } from "./helpers/evaluate.ts";

const SEEDS = 20;
const CASES_PER_SEED = 40;

function generator(seed: number) {
  let state = seed >>> 0 || 1;
  const rnd = () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
  const chance = (p: number) => rnd() < p;
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rnd() * items.length)]!;

  const properties = ["color", "margin", "padding", "marginTop", "lineHeight", "opacity", "--gap", "aspectRatio"];
  const selectors = [
    '":hover"',
    '"&:focus"',
    '".parent &"',
    '"&:hover, span"',
    '"@media (min-width: 1px)"',
    '"@supports (display: grid)"',
    '"::before"',
  ];
  const literalValues = ['"red"', "`blue`", "0", "8", "-4", "1.5", "null", "undefined", '"1rem"', '"calc(1px + 2%)"'];
  const dynamicValues = ["tone", "size", "size * 2", "maybe", 'flag ? "green" : null', "`${size}px`", "false"];
  const quotedKeys = ['"color"', "'margin'", '"--a-b"', "1", "0x10"];
  const computedKeys = ["[k]", '["color"]', "[`pad${'ding'}`]", "[flag ? 'color' : 'margin']"];
  const spreads = ["...dyn", "...(flag ? { margin: 1 } : {})", "...null", "...{ color: tone }"];

  const value = (depth: number): string => {
    if (depth < 2 && chance(0.2)) return object(depth + 1);
    return chance(0.7) ? pick(literalValues) : pick(dynamicValues);
  };

  function object(depth: number): string {
    const parts: string[] = [];
    const length = Math.floor(rnd() * 6);
    for (let index = 0; index < length; index++) {
      const roll = rnd();
      if (roll < 0.08) parts.push(pick(spreads));
      else if (roll < 0.16) parts.push(`${pick(computedKeys)}: ${value(depth)}`);
      else if (roll < 0.24) parts.push(`${pick(quotedKeys)}: ${value(depth)}`);
      else if (roll < 0.27)
        parts.push(`get ${pick(properties.filter((name) => !name.startsWith("-")))}() { return tone }`);
      else if (roll < 0.42 && depth < 3) parts.push(`${pick(selectors)}: ${object(depth + 1)}`);
      else parts.push(`${JSON.stringify(pick(properties))}: ${value(depth)}`);
    }
    return `{ ${parts.join(", ")} }`;
  }

  const argument = () => (chance(0.1) ? pick(["null", "false", "undefined"]) : object(0));
  const call = () => `css(${Array.from({ length: 1 + Math.floor(rnd() * 3) }, argument).join(", ")})`;

  return { call };
}

function moduleFor(seed: number): string {
  const { call } = generator(seed);
  const cases = Array.from({ length: CASES_PER_SEED }, () => `  () => ${call()},`);
  return [
    `import { css } from "kiln";`,
    `const tone = "teal", size = 3, maybe = null, flag = true, k = "padding", dyn = { color: "blue", margin: 2 };`,
    `export const cases = [`,
    ...cases,
    `];`,
  ].join("\n");
}

type Case = () => [string, () => { props: { rules: readonly (readonly [string, string])[] } }];

const outcome = (fn: Case) => {
  const [className, Styles] = fn();
  return {
    classes: [...new Set(className.split(" ").filter(Boolean))].sort(),
    rules: [...new Set(Styles().props.rules.map(([, text]) => text))].sort(),
  };
};

describe("compiled css() calls behave like runtime ones", () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    it(`seed ${seed}`, () => {
      const source = moduleFor(seed * 0x9e3779b1);
      const result = transform(source, `fuzz-${seed}.js`);
      expect(result, "the generator should always produce something to compile").not.toBeNull();

      const original: Case[] = evaluate(source).cases;
      const compiled: Case[] = evaluate(result!.code).cases;
      original.forEach((fn, index) => {
        expect(outcome(compiled[index]!), source.split("\n")[index + 3]).toEqual(outcome(fn));
      });
    });
  }

  it("covers compiled, partly compiled and runtime-only calls", () => {
    const code = Array.from(
      { length: SEEDS },
      (_, index) => transform(moduleFor((index + 1) * 0x9e3779b1), "a.js")!.code,
    ).join("\n");
    expect(code).toMatch(/css\(_kiln\$\d+\b/);
    expect(code).toMatch(/_kiln\$\(\[.*\],\{/);
    expect(code).toMatch(/css\(\{ /);
  });
});
