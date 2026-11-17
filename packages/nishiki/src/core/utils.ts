/** Unitless CSS styles. */
export const u: RegExp =
  /^(-|f[lo].*[^se]$|g.{5,}[^ps]$|z|o[pr]|(W.{5})?[lL]i.*(t|mp)$|a[ns]|(bo|s).{4}Im|sca|m.{6}[ds]|ta|co[lu].*[st]$|wido|ini|(fill|stop|stroke)Op|strokeMi|mathD|hyphenateL)/;

/** The djb2 hash of `value` continued from `h`, the state after what precedes it. */
export function hashFrom(h: number, value: string): number {
  for (let index = 0, len = value.length; index < len; index++) {
    h = ((h << 5) + h + value.charCodeAt(index)) >>> 0;
  }
  return h;
}

/** Hash a string using the djb2 algorithm. */
export const hash = (value: string): string => hashFrom(5381, value).toString(36);

// CSS whitespace is narrower than JavaScript's `\s` and `trim()`: a no-break space, for one, is part of a name.
const isWhitespace = (char: string | undefined) =>
  char === " " || char === "\t" || char === "\n" || char === "\r" || char === "\f";

/** Strip the CSS whitespace around a selector or at-rule, keeping an escaped one, which is part of the name. */
export function trimWhitespace(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && isWhitespace(text[start])) start++;
  while (end > start && isWhitespace(text[end - 1])) end--;
  let backslashes = 0;
  while (end - backslashes > start && text[end - 1 - backslashes] === "\\") backslashes++;
  if (backslashes % 2 === 1 && end < text.length) end++;
  return text.slice(start, end);
}

/** Split a comma-separated selector list while preserving escaped, quoted, nested function and attribute commas. */
export function splitSelectorList(selector: string): string[] {
  const selectors: string[] = [];
  let current = "";
  let depth = 0;
  let quote = "";

  for (let index = 0; index < selector.length; index++) {
    const char = selector[index];

    if (quote) {
      current += char;

      if (char === "\\") {
        current += selector[++index] ?? "";
      } else if (char === quote) {
        quote = "";
      }

      continue;
    }

    if (char === "\\") {
      current += char + (selector[++index] ?? "");
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (char === "(" || char === "[") {
      depth++;
      current += char;
      continue;
    }

    if (char === ")" || char === "]") {
      depth--;
      current += char;
      continue;
    }

    if (char === "," && depth === 0) {
      selectors.push(trimWhitespace(current));
      current = "";
      continue;
    }

    current += char;
  }

  selectors.push(trimWhitespace(current));
  return selectors;
}

function resolveSelectorPart(key: string, selector: string): string {
  if (key.includes("&")) {
    return key.replaceAll("&", selector);
  }

  if (key.startsWith(":") || key.startsWith("::")) {
    return selector + key;
  }

  return selector + " " + key;
}

/** Resolve a nested selector. */
export function resolveNestedSelector(key: string, selector: string): string {
  if (!selector) {
    return key;
  }

  const parents = splitSelectorList(selector);
  const children = splitSelectorList(key);
  const selectors: string[] = [];

  for (const parent of parents) {
    for (const child of children) {
      selectors.push(resolveSelectorPart(child, parent));
    }
  }

  return selectors.join(", ");
}
