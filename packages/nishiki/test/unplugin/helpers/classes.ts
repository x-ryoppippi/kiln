// Where a bundle's JavaScript names the classes of rules nishiki extracted, in any quotes: a packed entry keeps its key
// and class names, `[key, "n… n…"]`; a folded css() call is its class names and a component, `["n… n…", _nishiki$n]`;
// a css prop compiled away leaves a `className: "… n…"` prop, or joins an expression with them,
// `_nishiki$j(expression, "n… n…")`.
const ENTRY = /\[\s*(["'`])(?:\\.|(?!\1).)*?\1\s*,\s*(["'`])(n[0-9a-z]+(?: n[0-9a-z]+)*)\2\s*\]/g;
const FOLDED = /\[\s*(["'`])(n[0-9a-z]+(?: n[0-9a-z]+)*)\1\s*,/g;
const CLASS_NAME = /\bclassName\s*:\s*(["'`])((?:\\.|(?!\1).)*?)\1/g;
const JOINED = /,\s*(["'`])(n[0-9a-z]+(?: n[0-9a-z]+)*)\1\s*\)/g;

/** The classes of extracted rules that a bundle's JavaScript references. */
export const extractedClasses = (js: string): Set<string> =>
  new Set(
    [...js.matchAll(ENTRY), ...js.matchAll(FOLDED), ...js.matchAll(CLASS_NAME), ...js.matchAll(JOINED)]
      .flatMap((match) => match.at(-1)!.split(" "))
      // A runtime value's layer, such as `"n0"` in `_nishiki$v("color", tone, "n0")`, is no class: a rank has at most
      // two base-36 digits, a class name's hash all but never.
      .filter((name) => /^n[0-9a-z]{3,}$/.test(name)),
  );
