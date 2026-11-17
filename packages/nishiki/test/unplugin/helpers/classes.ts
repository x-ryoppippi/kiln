// Where a bundle's JavaScript names the classes of rules nishiki extracted, in any quotes: a packed entry keeps its key
// and class names, `[key, "n… n…"]`; a folded css() call is its class names and a component, `["n… n…", _nishiki$n]`;
// a css prop compiled away appends them to the element's `className: "… n… n…"`, or joins an expression with them,
// `_nishiki$j(expression, "n… n…")`.
const ENTRY = /\[\s*(["'`])(?:\\.|(?!\1).)*?\1\s*,\s*(["'`])(n[0-9a-z]+(?: n[0-9a-z]+)*)\2\s*\]/g;
const FOLDED = /\[\s*(["'`])(n[0-9a-z]+(?: n[0-9a-z]+)*)\1\s*,\s*[\w$.]+\s*\]/g;
// Only the class names that end the value, where the compiler appends them after the element's own.
const CLASS_NAME = /\bclassName\s*:\s*(["'`])(?:(?:\\.|(?!\1).)*? )??(n[0-9a-z]+(?: n[0-9a-z]+)*)\1/g;
const JOINED = /,\s*(["'`])(n[0-9a-z]+(?: n[0-9a-z]+)*)\1\s*\)/g;
// The layer that ends a call like a joined class name does, as in `_nishiki$v("color", tone, "n0")`: a runtime value
// always takes the base rank, at the depth of a property with no condition.
const RUNTIME_VALUE_LAYER = "n0";

/**
 * The classes of extracted rules that a bundle's JavaScript references. Fixtures give elements no class names of their
 * own shaped like nishiki's, which only the build's rules could tell apart from compiled ones.
 */
export const extractedClasses = (js: string): Set<string> =>
  new Set(
    [...js.matchAll(ENTRY), ...js.matchAll(FOLDED), ...js.matchAll(CLASS_NAME), ...js.matchAll(JOINED)]
      .flatMap((match) => match.at(-1)!.split(" "))
      .filter((name) => name !== RUNTIME_VALUE_LAYER),
  );
