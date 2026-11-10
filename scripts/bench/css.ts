// Kiln rules loaded against the rules a page uses, the benchmark's measure of CSS shipped for nothing.

// `bytes` is the UTF-8 length of the rule's own `selector{declarations}` text: as written in the file for the static
// method, as the CSSOM serialises it for the browser method. Only shares, not bytes, compare across the two.
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

// The innermost blocks of a stylesheet whose selector names a kiln class, with the bytes of `selector{declarations}`.
// Wrapping `@layer` and `@media` preludes are not counted. Kiln's output has no braces inside strings or comments.
export function rulesOf(css: string): Rule[] {
  const rules: Rule[] = [];
  // `start` follows the last `{`, `}` or top-level `;`, so it begins the prelude of the next block.
  let start = 0;
  let prelude = 0;
  let open = -1;
  for (let index = 0; index < css.length; index++) {
    const char = css[index];
    if (char === "{") {
      prelude = start;
      open = index;
      start = index + 1;
    } else if (char === "}") {
      // Only a `}` that closes the most recent `{` ends a block with no blocks inside.
      if (open !== -1) {
        const name = KILN_SELECTOR.exec(css.slice(prelude, open))?.[1];
        if (name) rules.push({ name, bytes: Buffer.byteLength(css.slice(prelude, index + 1).trim(), "utf8") });
        open = -1;
      }
      start = index + 1;
    } else if (char === ";" && open === -1) {
      start = index + 1;
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
