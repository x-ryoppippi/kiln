import { LAYER } from "./config.ts";
import { compiled, compileRaw, type Compiled } from "./resolve.ts";
import { hash, u } from "./utils.ts";

/** A single atomic rule: the class name it is keyed by and its full CSS text. */
export type Rule = readonly [className: string, text: string];

/**
 * Compiled styles for one top-level key of a style object.
 * Merging works on whole entries, so a later entry for the same key replaces an earlier one.
 */
export type Entry = readonly [key: string, className: string, rules: readonly Rule[]];

export function formatSelector(className: string, selector: string): string {
  if (selector === "") return "." + className;
  return selector.includes("&")
    ? selector.replaceAll("&", "." + className)
    : "." + className + (selector.startsWith(":") ? selector : " " + selector);
}

function formatDeclaration(prop: string, value: string | number): string {
  const property = prop.startsWith("--") ? prop : prop.replace(/[A-Z]|^ms/g, "-$&").toLowerCase();
  const parsed = typeof value === "number" && !prop.startsWith("--") && !u.test(prop) ? value + "px" : value;
  return property + ":" + parsed;
}

/**
 * The rule declaring `prop: value` in `layer` inside nishiki's top-level layer, under one selector of a list (`""` for
 * the element) and `atRules`.
 */
export function ruleOf(
  prop: string,
  value: string | number,
  part: string,
  atRules: readonly string[],
  layer: string,
): Rule {
  const className =
    "n" + hash(prop + ":" + value + "|" + formatSelector("&", part) + "|" + atRules.join("|") + "|" + layer);
  let text = formatSelector(className, part) + "{" + formatDeclaration(prop, value) + "}";
  for (let index = atRules.length - 1; index >= 0; index--) text = atRules[index] + "{" + text + "}";
  return [className, "@layer " + LAYER + "." + layer + "{" + text + "}"];
}

/** What `ruleOf` formats a rule from, which the build ranks into its layer. */
export type RuleInput = readonly [
  prop: string,
  value: string | number,
  part: string,
  atRules: readonly string[],
  layer: string,
];

/** The entry of a top-level key whose rules are made from `inputs`. */
export function entryOf(key: string, inputs: readonly RuleInput[]): Entry {
  const rules = inputs.map((input) => ruleOf(...input));
  return [key, rules.map(([className]) => className).join(" "), rules];
}

// A rule as the build plugin packs it: the value and the layer, then the property, the selector and the at-rules
// wherever they differ from the entry's key, the element and none.
type PackedRule = readonly [value: string | number, layer: string, prop?: string, part?: string, ...atRules: string[]];

/** An entry as the build plugin packs it: the key with what its rules are made from, which the runtime formats. */
export type Packed = readonly [key: string, ...rules: PackedRule[]];

/** Pack an entry's rule inputs, leaving out each part `unpack` can tell from the key. */
export function pack(key: string, inputs: readonly RuleInput[]): Packed {
  return [
    key,
    ...inputs.map(([prop, value, part, atRules, layer]) => {
      const rule: (string | number)[] = [value, layer, prop, part, ...atRules];
      if (atRules.length === 0 && part === "") rule.length = prop === key ? 2 : 3;
      return rule as unknown as PackedRule;
    }),
  ];
}

/** Compiled styles from packed entries. Emitted by the build plugin; not meant to be written by hand. */
export const unpack = (entries: readonly Packed[]): Compiled =>
  compiled(
    entries.map(([key, ...rules]) =>
      entryOf(
        key,
        rules.map(([value, layer, prop = key, part = "", ...atRules]) => [prop, value, part, atRules, layer]),
      ),
    ),
  );

/**
 * Compile a property whose value is known only at runtime, in the layer the build plugin ranked its key into, so that
 * the runtime needs no ranking of its own. Emitted by the build plugin; not meant to be written by hand.
 */
export function compileValue(key: string, value: unknown, layer: string): Compiled {
  // A key that holds an object is a selector after all, which only the compiler can rank.
  if (typeof value === "object" && value !== null) return compiled(compileRaw(key, value));
  const primitive = typeof value === "string" || typeof value === "number";
  return compiled([entryOf(key, primitive ? [[key, value, "", [], layer]] : [])]);
}
