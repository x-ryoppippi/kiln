// Writes packages/nishiki/src/core/properties.ts: how many layers below a longhand each CSS shorthand and logical property
// sits, so that whichever of two overlapping properties is more specific wins in any order.
//
//   node scripts/gen-property-tiers.ts
//
// Rules, from @webref/css's longhands and logical property groups, for the properties mdn-data lists as not obsolete:
// - A property covers the longhands it sets: a longhand itself, a logical longhand its physical counterpart in a
//   horizontal, left-to-right writing mode, a shorthand what its longhands and reset-only longhands cover, `all` every
//   longhand.
// - Of two properties covering overlapping longhands, the one covering fewer wins; if they cover as many, the physical
//   one wins over the logical one, and failing that the name later in alphabetical order. Two that cover the same
//   longhands and are both physical or both logical, such as line-clamp and -webkit-line-clamp, stay level.
// - A property's depth is the length of the longest chain of properties that win over it. A legacy alias, such as
//   -webkit-border-radius, takes the depth of the property it aliases. Any property missing here has depth 0.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const webrefPackage = require.resolve("@webref/css/package.json");
const mdnPackage = require.resolve("mdn-data/package.json");

interface WebrefProperty {
  name: string;
  longhands?: string[];
  resetLonghands?: string[];
  logicalPropertyGroup?: string;
  legacyAliasOf?: string;
}

const webref: { properties: WebrefProperty[] } = JSON.parse(
  readFileSync(path.join(path.dirname(webrefPackage), "css.json"), "utf8"),
);
const mdn: Record<string, { status: string }> = JSON.parse(
  readFileSync(path.join(path.dirname(mdnPackage), "css/properties.json"), "utf8"),
);
const versionOf = (file: string) => (JSON.parse(readFileSync(file, "utf8")) as { version: string }).version;

const properties = new Map(webref.properties.map((property) => [property.name, property]));
const listed = (name: string) => mdn[name] !== undefined && mdn[name].status !== "obsolete";
const names = [...properties.keys()]
  .filter((name) => {
    const alias = properties.get(name)!.legacyAliasOf;
    return alias ? listed(alias) : listed(name);
  })
  .sort();

// The physical longhand a logical one maps to in a horizontal, left-to-right writing mode.
const PHYSICAL: [RegExp, string][] = [
  [/^inset-inline-start$/, "left"],
  [/^inset-inline-end$/, "right"],
  [/^inset-block-start$/, "top"],
  [/^inset-block-end$/, "bottom"],
  [/-inline-start/, "-left"],
  [/-inline-end/, "-right"],
  [/-block-start/, "-top"],
  [/-block-end/, "-bottom"],
  [/-start-start-/, "-top-left-"],
  [/-start-end-/, "-top-right-"],
  [/-end-start-/, "-bottom-left-"],
  [/-end-end-/, "-bottom-right-"],
  [/^inline-size$/, "width"],
  [/^block-size$/, "height"],
  [/^(min|max)-inline-size$/, "$1-width"],
  [/^(min|max)-block-size$/, "$1-height"],
  [/-inline-size$/, "-width"],
  [/-block-size$/, "-height"],
  [/-inline$/, "-x"],
  [/-block$/, "-y"],
];

function physicalOf(property: WebrefProperty): string | null {
  if (!property.logicalPropertyGroup) return null;
  for (const [pattern, replacement] of PHYSICAL) {
    if (!pattern.test(property.name)) continue;
    const physical = property.name.replace(pattern, replacement);
    return properties.get(physical)?.logicalPropertyGroup === property.logicalPropertyGroup ? physical : null;
  }
  return null;
}

const coverage = new Map<string, Set<string>>();
function coverageOf(name: string, path: string[] = []): Set<string> {
  const known = coverage.get(name);
  if (known) return known;
  const property = properties.get(properties.get(name)?.legacyAliasOf ?? name);
  const parts = [...(property?.longhands ?? []), ...(property?.resetLonghands ?? [])];
  const covered = new Set<string>();
  if (!property || parts.length === 0) covered.add((property && physicalOf(property)) ?? name);
  for (const part of parts)
    if (!path.includes(part)) for (const longhand of coverageOf(part, [...path, name])) covered.add(longhand);
  coverage.set(name, covered);
  return covered;
}
for (const name of properties.keys()) coverageOf(name);
coverage.set("all", new Set([...coverage.values()].flatMap((covered) => [...covered])));

const isLogical = (name: string): boolean => {
  const property = properties.get(name)!;
  return physicalOf(property) !== null || (property.longhands ?? []).some((longhand) => isLogical(longhand));
};

const contains = (outer: Set<string>, inner: Set<string>) => [...inner].every((longhand) => outer.has(longhand));
const overlaps = (a: Set<string>, b: Set<string>) => [...a].some((longhand) => b.has(longhand));

// The properties that win over each property.
const winners = new Map(names.map((name) => [name, new Set<string>()]));
const ranked = names.filter((name) => !properties.get(name)!.legacyAliasOf);
for (const [index, a] of ranked.entries()) {
  for (const b of ranked.slice(index + 1)) {
    const [coverA, coverB] = [coverage.get(a)!, coverage.get(b)!];
    if (!overlaps(coverA, coverB)) continue;
    const winner =
      coverA.size !== coverB.size
        ? coverA.size < coverB.size
          ? a
          : b
        : isLogical(a) !== isLogical(b)
          ? isLogical(a)
            ? b
            : a
          : contains(coverA, coverB)
            ? null
            : b;
    if (winner === null) continue;
    winners.get(winner === a ? b : a)!.add(winner);
  }
}

const depths = new Map<string, number>();
function depthOf(name: string, path: string[] = []): number {
  const known = depths.get(name);
  if (known !== undefined) return known;
  if (path.includes(name)) throw new Error(`cycle: ${[...path, name].join(" < ")}`);
  let depth = 0;
  for (const winner of winners.get(name)!) depth = Math.max(depth, depthOf(winner, [...path, name]) + 1);
  depths.set(name, depth);
  return depth;
}

// nishiki's keys are React's: camelCase, with a capitalised vendor prefix except for `ms`.
const keyOf = (name: string) =>
  name
    .replace(/^-(webkit|moz)-/, (_, vendor: string) => vendor[0]!.toUpperCase() + vendor.slice(1) + "-")
    .replace(/^-ms-/, "ms-")
    .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

// Logical longhands, which sit one level deep, follow a pattern, so the table lists only the properties the pattern
// gets wrong: those it would put one level deep wrongly, at depth 0, and every other depth.
const LOGICAL = /(?:Block|Inline)(?:Start|End)?(?:Size|Width|Style|Color)?$|(?:Start|End){2}(?:Radius|Shape)$/;
const byDepth: (string[] | undefined)[] = [[]];
for (const name of names) {
  const key = keyOf(name);
  const depth = depthOf(properties.get(name)!.legacyAliasOf ?? name);
  if (depth !== (LOGICAL.test(key) ? 1 : 0)) (byDepth[depth] ??= []).push(key);
}
const encoded = Array.from(byDepth, (keys) => (keys ?? []).sort().join(" ")).join("|");

const out = path.join(root, "packages/nishiki/src/core/properties.ts");
writeFileSync(
  out,
  `// Generated by scripts/gen-property-tiers.ts from @webref/css ${versionOf(webrefPackage)} and mdn-data ${versionOf(mdnPackage)}; do not edit.

// Each group lists the properties one layer deeper than the one before, starting at longhands' own layer; any other
// property sits one level deep if it reads as a logical longhand, and in longhands' layer otherwise.
const DEPTHS = ${JSON.stringify(encoded)};
const LOGICAL = ${LOGICAL};

let depths: Map<string, number> | undefined;

// How many layers below a longhand a property sits: deeper for broader shorthands, and logical below physical.
export function depthOf(property: string): number {
  if (!depths) {
    depths = new Map();
    for (const [depth, group] of DEPTHS.split("|").entries()) for (const key of group.split(" ")) depths.set(key, depth);
  }
  return depths.get(property) ?? (LOGICAL.test(property) ? 1 : 0);
}
`,
);
const formatted = spawnSync("vp", ["fmt", out], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
if (formatted.error) throw formatted.error;
if (formatted.status !== 0) throw new Error(`vp fmt ${out} exited with ${formatted.status ?? formatted.signal}`);
