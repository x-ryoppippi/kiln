// Nishiki rules loaded against the rules a page uses, the benchmark's measure of CSS shipped for nothing.

// `bytes` is the UTF-8 length of the rule's own `selector{declarations}` text, without the rules nested in it: as
// written in the file for the static method, as the CSSOM serialises it for the browser method. Only shares, not
// bytes, compare across the two.
export type Rule = { name: string; bytes: number };
export type Unused = { rules: number; unusedRules: number; bytes: number; unusedBytes: number };
// Shares of unused rules and bytes, from 0 to 1.
export type Share = { rules: number; bytes: number };
export type UnusedSummary = {
  // "browser" counts the classes on elements the page renders as used; "static" those the loaded JS chunks mention.
  method: "browser" | "static";
  firstLoad: Unused;
  // Over the navigations that loaded any nishiki rule; null when none did.
  navigation: { mean: Share; worst: Share } | null;
  visitAll: Unused;
};

export const NISHIKI_SELECTOR: RegExp = /\.(n[0-9a-z]+)(?![\w-])/;

// A nested rule's selector with its parent's spelled out, as `querySelectorAll` needs it: each selector of the list is
// relative to the parent on its own, through `&` or else as a descendant. Runs in the page, so it is self-contained.
export function resolveNested(selector: string, parent: string | undefined): string {
  if (parent === undefined) return selector;
  const list: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const char = selector[i]!;
    if (char === "\\") i++;
    else if (quote) quote = char === quote ? "" : quote;
    else if (char === '"' || char === "'") quote = char;
    else if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth--;
    else if (char === "," && depth === 0) {
      list.push(selector.slice(start, i));
      start = i + 1;
    }
  }
  list.push(selector.slice(start));
  return list
    .map((item) => item.trim())
    .map((item) => (item.includes("&") ? item.replaceAll("&", `:is(${parent})`) : `:is(${parent}) ${item}`))
    .join(", ");
}

// A selector as `querySelectorAll` can test it while the page is not hovered, focused or the like: each state the page
// is not in while it is measured, and each pseudo-element, becomes `:where(*)`, which matches any element. Dropping it
// instead would leave `.a > :hover` without its last compound, and `:is(.a) :hover` (a nested `:hover`) matching
// `.a` itself rather than its descendants. Runs in the page, so it is self-contained.
export function withoutUserAction(selector: string): string {
  return selector.replace(
    /::?(?:hover|focus|focus-visible|focus-within|active|visited|placeholder|backdrop|before|after|selection|marker|first-line|first-letter|-webkit-[\w-]+|-moz-[\w-]+)(?![\w-])/g,
    ":where(*)",
  );
}

// The style rules of a stylesheet whose selector names a nishiki class, as the browser method's CSSStyleRule walk sees
// them: every block whose prelude is not an at-rule's, nested or not, with only its own declarations.
export function rulesOf(css: string): Rule[] {
  const rules: Rule[] = [];
  const open: { prelude: string; declarations: string }[] = [];
  // Text since the last `{`, `}` or `;`: a declaration, or the prelude of the next block.
  let pending = "";
  for (let index = 0; index < css.length; index++) {
    const char = css[index]!;
    if (char === "/" && css[index + 1] === "*") {
      const end = css.indexOf("*/", index + 2);
      index = end === -1 ? css.length : end + 1;
    } else if (char === '"' || char === "'") {
      let end = index + 1;
      while (end < css.length && css[end] !== char) end += css[end] === "\\" ? 2 : 1;
      pending += css.slice(index, end + 1);
      index = end;
    } else if (char === "(" && /(?:^|[^\w-])url$/i.test(pending) && !/^\s*["']/.test(css.slice(index + 1))) {
      // An unquoted url() is one token, so braces and semicolons inside it are part of the value.
      let end = index + 1;
      while (end < css.length && css[end] !== ")") end += css[end] === "\\" ? 2 : 1;
      pending += css.slice(index, end + 1);
      index = end;
    } else if (char === "\\") {
      pending += css.slice(index, index + 2);
      index++;
    } else if (char === "{" && /^--[\w-]*\s*:/.test(pending.trimStart())) {
      // A custom property's value may hold a {} block, which is part of the value rather than a nested rule.
      let depth = 0;
      let end = index;
      for (; end < css.length; end++) {
        const inner = css[end]!;
        if (inner === '"' || inner === "'") {
          end++;
          while (end < css.length && css[end] !== inner) end += css[end] === "\\" ? 2 : 1;
        } else if (inner === "\\") end++;
        else if (inner === "{") depth++;
        else if (inner === "}" && --depth === 0) break;
      }
      pending += css.slice(index, end + 1);
      index = end;
    } else if (char === "{") {
      open.push({ prelude: pending.trim(), declarations: "" });
      pending = "";
    } else if (char === "}") {
      const block = open.pop();
      if (block) {
        const { prelude } = block;
        const declarations = (block.declarations + pending).trim();
        const name = prelude.startsWith("@") ? undefined : NISHIKI_SELECTOR.exec(prelude)?.[1];
        if (name) rules.push({ name, bytes: Buffer.byteLength(`${prelude}{${declarations}}`, "utf8") });
      }
      pending = "";
    } else if (char === ";") {
      const block = open.at(-1);
      if (block) block.declarations += `${pending};`;
      pending = "";
    } else {
      pending += char;
    }
  }
  return rules;
}

export function unusedOf(rules: Iterable<Rule>, used: ReadonlySet<string>): Unused {
  const result: Unused = { rules: 0, unusedRules: 0, bytes: 0, unusedBytes: 0 };
  for (const rule of rules) {
    result.rules++;
    result.bytes += rule.bytes;
    if (!used.has(rule.name)) {
      result.unusedRules++;
      result.unusedBytes += rule.bytes;
    }
  }
  return result;
}

// Null when there are no nishiki rules to share out.
export function shareOf(unused: Unused): Share | null {
  return unused.rules ? { rules: unused.unusedRules / unused.rules, bytes: unused.unusedBytes / unused.bytes } : null;
}

export function summarise(
  method: UnusedSummary["method"],
  firstLoad: Unused,
  navigations: Unused[],
  visitAll: Unused,
): UnusedSummary {
  const shares = navigations.map(shareOf).filter((share) => share !== null);
  const mean = (key: keyof Share) => shares.reduce((sum, share) => sum + share[key], 0) / shares.length;
  const worst = (key: keyof Share) => Math.max(...shares.map((share) => share[key]));
  return {
    method,
    firstLoad,
    navigation: shares.length
      ? {
          mean: { rules: mean("rules"), bytes: mean("bytes") },
          worst: { rules: worst("rules"), bytes: worst("bytes") },
        }
      : null,
    visitAll,
  };
}
