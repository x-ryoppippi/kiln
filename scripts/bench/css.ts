// Kiln rules loaded against the rules a page uses, the benchmark's measure of CSS shipped for nothing.

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
  // Over the navigations that loaded any kiln rule; null when none did.
  navigation: { mean: Share; worst: Share } | null;
  visitAll: Unused;
};

export const KILN_SELECTOR: RegExp = /\.(k[0-9a-z]+)(?![\w-])/;

// The style rules of a stylesheet whose selector names a kiln class, as the browser method's CSSStyleRule walk sees
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
    } else if (char === "\\") {
      pending += css.slice(index, index + 2);
      index++;
    } else if (char === "{") {
      open.push({ prelude: pending.trim(), declarations: "" });
      pending = "";
    } else if (char === "}") {
      const block = open.pop();
      if (block) {
        const { prelude } = block;
        const declarations = (block.declarations + pending).trim();
        const name = prelude.startsWith("@") ? undefined : KILN_SELECTOR.exec(prelude)?.[1];
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

// Null when there are no kiln rules to share out.
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
