import { parseSync, Visitor } from "oxc-parser";

/**
 * Record each rule's text under its class name in `registry`, and fail when a class name already stands for another
 * rule. A class name is a hash of its rule, so two rules can share one, and a page would then only get one of them.
 */
export function claim(
  registry: Map<string, string>,
  rules: Iterable<readonly [className: string, text: string]>,
  where?: { id: string; ids: Map<string, string> },
): void {
  for (const [className, text] of rules) {
    const known = registry.get(className);
    if (known === undefined) {
      registry.set(className, text);
      where?.ids.set(className, where.id);
      continue;
    }
    if (known === text) continue;
    const from = where?.ids.get(className);
    const places = where && from !== undefined ? ` (in ${from} and ${where.id})` : "";
    throw new Error(
      `[nishiki] the rules ${known} and ${text}${places} have the same class name, ${className}, so a page would get ` +
        `only one of them. nishiki names a rule after a hash of it; write one of these values another way that means ` +
        `the same, such as with other units, to give it another name.`,
    );
  }
}

// What a build names its rules with `classNames: "compact"`: never a hashed class name, which is `n` and base-36 digits,
// so a rule the runtime inserts under its hash cannot take one.
const PREFIX = "_";

/**
 * Names for a build's rules by how many of its modules use each, the most used first, so that the names a build
 * repeats most are the shortest. Ties go by class name, so the same build always names its rules alike.
 */
export function compactNames(uses: ReadonlyMap<string, number>): Map<string, string> {
  const ranked = [...uses].sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0));
  return new Map(ranked.map(([className], index) => [className, PREFIX + digits(index)]));
}

// The `index`th string of base-36 digits, shortest first: every one-digit string, then every two-digit one, and so on.
function digits(index: number): string {
  let width = 1;
  while (index >= 36 ** width) index -= 36 ** width++;
  return index.toString(36).padStart(width, "0");
}

/** How many times `lists` use each class. */
export function usesOf(lists: Iterable<Iterable<string>>): Map<string, number> {
  const uses = new Map<string, number>();
  for (const list of lists) for (const className of list) uses.set(className, (uses.get(className) ?? 0) + 1);
  return uses;
}

/** A rule's text under its new name. */
export const renameRule = (text: string, className: string, name: string): string =>
  text.replace(new RegExp(`\\.${className}(?![\\w-])`, "g"), "." + name);

/** A replacement of `code.slice(start, end)`. */
export interface Edit {
  start: number;
  end: number;
  text: string;
}

const CLASS = /(?<![\w$-])n[0-9a-z]+(?![\w$-])/g;

/**
 * The edits that rename the classes in `names` wherever a string in `code` names them, as compiled modules write their
 * class names: in string literals, alone or after other classes. Code elsewhere, such as an identifier that reads like a
 * class, stays as it is.
 */
export function renameEdits(code: string, fileName: string, names: ReadonlyMap<string, string>): Edit[] {
  if (!code.match(CLASS)?.some((match) => names.has(match))) return [];
  const parsed = parseSync(fileName, code, { lang: "jsx", sourceType: "unambiguous" });
  if (parsed.errors.length > 0) {
    throw new Error(
      `[nishiki] extract: { classNames: "compact" } cannot rename the classes in ${fileName}, which does not parse: ` +
        parsed.errors[0]!.message,
    );
  }
  const edits: Edit[] = [];
  const rename = (start: number, end: number) => {
    for (const match of code.slice(start, end).matchAll(CLASS)) {
      const name = names.get(match[0]);
      if (name !== undefined) {
        edits.push({ start: start + match.index, end: start + match.index + match[0].length, text: name });
      }
    }
  };
  new Visitor({
    Literal(node) {
      if (typeof node.value === "string") rename(node.start, node.end);
    },
    TemplateElement(node) {
      rename(node.start, node.end);
    },
  }).visit(parsed.program);
  return edits.sort((a, b) => a.start - b.start);
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;
  const { compileEntry } = await import("../core/index.ts");

  describe("claim", () => {
    // djb2 hashes these two rules alike.
    const ruleOfHeight = (value: string) => compileEntry("height", value)[0]![2][0]!;
    const [taller, shorter] = [ruleOfHeight("7044px"), ruleOfHeight("2100.11rem")];

    it("records each rule, and lets a rule come again", () => {
      const registry = new Map<string, string>();
      claim(registry, [taller, taller]);
      expect(registry).toEqual(new Map([taller]));
    });

    it("fails when two rules have the same class name, naming both and where they come from", () => {
      expect(taller[0]).toBe(shorter[0]);
      const where = { id: "/src/a.tsx", ids: new Map<string, string>() };
      const registry = new Map<string, string>();
      claim(registry, [taller], where);
      expect(() => claim(registry, [shorter], { ...where, id: "/src/b.tsx" })).toThrow(
        `[nishiki] the rules ${taller[1]} and ${shorter[1]} (in /src/a.tsx and /src/b.tsx) have the same class name, ` +
          `${taller[0]}`,
      );
      expect(() => claim(new Map([taller]), [shorter])).toThrow(/^\[nishiki\] the rules .* have the same class name/);
    });
  });

  describe("compactNames", () => {
    it("names the most used rules first, then by class name, never like a hashed class", () => {
      const names = compactNames(
        new Map([
          ["nb", 1],
          ["na", 1],
          ["nc", 3],
        ]),
      );
      expect([...names]).toEqual([
        ["nc", "_0"],
        ["na", "_1"],
        ["nb", "_2"],
      ]);
      const many = [...compactNames(new Map(Array.from({ length: 1333 }, (_, index) => ["n" + index, 1]))).values()];
      expect(new Set(many).size).toBe(1333);
      expect(many.slice(0, 1332).every((name) => /^_[0-9a-z]{1,2}$/.test(name))).toBe(true);
      expect([many[35], many[36], many[1331], many[1332]]).toEqual(["_z", "_00", "_zz", "_000"]);
    });
  });

  describe("renameRule", () => {
    it("renames every selector of the rule's class, and no other class that starts like it", () => {
      expect(renameRule("@layer nishiki.n2{.nab+.nab .nabc,.nab:hover{color:red}}", "nab", "_0")).toBe(
        "@layer nishiki.n2{._0+._0 .nabc,._0:hover{color:red}}",
      );
    });
  });

  describe("renameEdits", () => {
    const names = new Map([
      ["nabc", "_0"],
      ["ndef", "_1"],
    ]);
    const apply = (code: string) => {
      let out = code;
      for (const { start, end, text } of renameEdits(code, "chunk.js", names).reverse()) {
        out = out.slice(0, start) + text + out.slice(end);
      }
      return out;
    };

    it("renames the classes a string names, alone or among others, in any quotes", () => {
      expect(apply(`const a = [["padding", "nabc ndef"]], b = 'own nabc', c = \`nabc \${x} ndef\`;`)).toBe(
        `const a = [["padding", "_0 _1"]], b = 'own _0', c = \`_0 \${x} _1\`;`,
      );
      expect(apply(`<p className="intro nabc" />`)).toBe(`<p className="intro _0" />`);
    });

    it("leaves identifiers, comments, other classes and other build's names alone", () => {
      const code = `const nabc = 1; // nabc\nconst b = "nabcd xnabc n-abc nzzz";`;
      expect(apply(code)).toBe(code);
      expect(renameEdits("const a = 1;", "chunk.js", names)).toEqual([]);
    });

    it("fails on code it cannot parse rather than leave classes without rules", () => {
      expect(() => renameEdits(`const a = "nabc" +;`, "chunk.js", names)).toThrow(
        /cannot rename the classes in chunk\.js/,
      );
    });
  });
}
