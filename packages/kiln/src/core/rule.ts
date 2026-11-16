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

/** The rule declaring `prop: value` in `layer`, under one selector of a list (`""` for the element) and `atRules`. */
export function ruleOf(
  prop: string,
  value: string | number,
  part: string,
  atRules: readonly string[],
  layer: string,
): Rule {
  const className =
    "k" + hash(prop + ":" + value + "|" + formatSelector("&", part) + "|" + atRules.join("|") + "|" + layer);
  let text = formatSelector(className, part) + "{" + formatDeclaration(prop, value) + "}";
  for (let index = atRules.length - 1; index >= 0; index--) text = atRules[index] + "{" + text + "}";
  return [className, "@layer " + layer + "{" + text + "}"];
}

/**
 * Compile a property whose value is known only at runtime, in the layer the build plugin ranked its key into, so that
 * the runtime needs no ranking of its own. Emitted by the build plugin; not meant to be written by hand.
 */
export function compileValue(key: string, value: unknown, layer: string): Compiled {
  // A key that holds an object is a selector after all, which only the compiler can rank.
  if (typeof value === "object" && value !== null) return compiled(compileRaw(key, value));
  const rules = typeof value === "string" || typeof value === "number" ? [ruleOf(key, value, "", [], layer)] : [];
  return compiled([[key, rules.map(([className]) => className).join(" "), rules]]);
}
