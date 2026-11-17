import { LAYER } from "./config.ts";
import { compiled, compileRaw, entriesOf, type Compiled } from "./resolve.ts";
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

const VARIABLE = "--n-";

/** The custom property an element sets the runtime value of a property in, which nishiki's one rule for it reads. */
export const variableName = (prop: string): string => VARIABLE + propertyName(prop);

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

// A CSS-wide keyword applies to the declaration it is the value of, or whose `var()` falls back to it, so set as a
// custom property it would make that inherit, or have no value, instead of the property; and `!important` is no part
// of a custom property's value, which React's client drops whole.
const OWN_RULE = /\b(?:inherit|initial|unset|revert)\b|!/i;

/**
 * The runtime values of `key` as the custom property `name`, which the one static rule of `base` in `layer` reads, so
 * that a value needs no rule of its own. A number takes px where `px` says the property takes it. A value that the
 * custom property cannot carry as the property would take it gets the entry `format` formats for it: `formatValue`, or
 * `compileValue`, which formats the same from the key and layer alone, in builds that load it anyway. Emitted by the
 * build plugin for styles that reach an element, which sets the custom property inline; not meant to be written by hand.
 */
export function variable(
  base: Compiled,
  name: string,
  layer: string,
  format: typeof formatValue,
  px?: 1,
): (value: unknown) => Compiled {
  const [[key, className, rules]] = entriesOf(base) as [Entry];
  const own = format(key, layer, hashFrom(5381, key + ":"), 0, name.slice(VARIABLE.length));
  const custom = key.startsWith("--");
  return (value) =>
    typeof value === "number"
      ? compiled([[key, className, rules, { [name]: px ? value + "px" : value }]])
      : typeof value !== "string" || OWN_RULE.test(value)
        ? own(value)
        : compiled(
            // Custom properties inherit, so an element without a value of its own must not take the class that reads
            // one. An empty value is one only for a custom property, which a space sets, since React drops an empty
            // one.
            value || custom ? [[key, className, rules, { [name]: value || " " }]] : [[key, "", []]],
          );
}
