import { LAYER } from "./config.ts";
import { compiled, compileRaw, type Compiled } from "./resolve.ts";
import { hash, hashFrom, u } from "./utils.ts";

/** A single atomic rule: the class name it is keyed by and its full CSS text. */
export type Rule = readonly [className: string, text: string];

/** Custom properties an element sets inline, which the static rules of its class names read. */
export type Variables = Readonly<Record<string, string | number>>;

/**
 * Compiled styles for one top-level key of a style object, with the custom properties a runtime value sets.
 * Merging works on whole entries, so a later entry for the same key replaces an earlier one.
 */
export type Entry = readonly [key: string, className: string, rules: readonly Rule[], variables?: Variables];

export function formatSelector(className: string, selector: string): string {
  if (selector === "") return "." + className;
  return selector.includes("&")
    ? selector.replaceAll("&", "." + className)
    : "." + className + (selector.startsWith(":") ? selector : " " + selector);
}

const propertyName = (prop: string): string =>
  prop.startsWith("--") ? prop : prop.replace(/[A-Z]|^ms/g, "-$&").toLowerCase();

/** Whether a number value of the property takes px. */
export const takesPx = (prop: string): boolean => !prop.startsWith("--") && !u.test(prop);

/** The custom property an element sets the runtime value of a property in, which nishiki's one rule for it reads. */
export const variableName = (prop: string): string => "--n-" + propertyName(prop);

function formatDeclaration(prop: string, value: string | number): string {
  return propertyName(prop) + ":" + (typeof value === "number" && takesPx(prop) ? value + "px" : value);
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
 * Compile the values of a property known only at runtime, in the layer the build plugin ranked its key into, so that
 * the runtime needs no ranking of its own. For builds that unpack their entries, which load `ruleOf` anyway. Emitted by
 * the build plugin; not meant to be written by hand.
 */
export const compileValue =
  (key: string, layer: string) =>
  (value: unknown): Compiled =>
    // A key that holds an object is a selector after all, which only the compiler can rank.
    typeof value === "object" && value !== null
      ? compiled(compileRaw(key, value))
      : compiled([
          entryOf(key, typeof value === "string" || typeof value === "number" ? [[key, value, "", [], layer]] : []),
        ]);

/** What `formatValue` formats the rules of a key's runtime values from: all that `ruleOf` derives from the key. */
export type ValueFormat = readonly [key: string, layer: string, state: number, px?: 0 | 1, property?: string];

/** The format of `key`'s runtime values in `layer`, so that the rules `formatValue` formats are those of `ruleOf`. */
export function valueFormat(key: string, layer: string): ValueFormat {
  const format: [string, string, number, (0 | 1)?, string?] = [key, layer, hashFrom(5381, key + ":")];
  const property = propertyName(key);
  if (property !== key) format.push(takesPx(key) ? 1 : 0, property);
  else if (takesPx(key)) format.push(1);
  return format;
}

/**
 * `compileValue` for builds whose entries are extracted, which load no formatting code: the build plugin derives what
 * `ruleOf` would from the key, namely the hash state after `key:`, whether a number takes px and the property's CSS
 * name. Emitted by the build plugin; not meant to be written by hand.
 */
export function formatValue(
  key: string,
  layer: string,
  state: number,
  px?: 0 | 1,
  property: string = key,
): (value: unknown) => Compiled {
  const condition = "|.&||" + layer;
  const prefix = "@layer " + LAYER + "." + layer + "{.";
  return (value) => {
    if (typeof value === "object" && value !== null) return compiled(compileRaw(key, value));
    if (typeof value !== "string" && typeof value !== "number") return compiled([[key, "", []]]);
    const className = "n" + hashFrom(hashFrom(state, "" + value), condition).toString(36);
    const declaration = property + ":" + (px && typeof value === "number" ? value + "px" : value);
    return compiled([[key, className, [[className, prefix + className + "{" + declaration + "}}"]]]]);
  };
}
