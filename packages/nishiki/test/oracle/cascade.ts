// A small CSS cascade, written apart from nishiki: it imports nothing from nishiki's sources. It reads style sheets as text in
// document order, orders cascade layers the way CSS Cascade 5 does, evaluates the media queries and selectors nishiki
// emits for one element, computes specificity itself, puts the element's inline style above them, substitutes custom
// properties into `var()`, expands the shorthands it knows into longhands, and returns the value each longhand and
// custom property computes to, inheriting custom properties and `color` from the parent. Normal declarations only; it
// does not know `!important`, and it checks no value but an empty one.

/** The element, its ancestors and the page around it. */
export interface ElementState {
  classes: ReadonlySet<string>;
  attributes?: Readonly<Record<string, string>>;
  // Pseudo-classes that match the element, such as "hover".
  pseudo?: ReadonlySet<string>;
  // The classes of its ancestors.
  ancestors?: ReadonlySet<string>;
  // The viewport width in px, and media features that hold, such as "prefers-color-scheme: dark" or "print".
  width: number;
  media?: ReadonlySet<string>;
  // The declarations of its style attribute, by property.
  style?: Readonly<Record<string, string>>;
  // What its parent computes to, which it inherits from.
  parent?: Readonly<Record<string, string>>;
}

interface Declaration {
  property: string;
  value: string;
  layer: string[] | null;
  specificity: [number, number, number];
  order: number;
  inline?: boolean;
}

// The properties of the vocabulary an element inherits from its parent, besides every custom property.
const INHERITED = new Set(["color"]);

// Longhands each shorthand sets, in the order its values apply: one to four values give top, right, bottom, left.
const BOX = ["top", "right", "bottom", "left"];
const SHORTHANDS: Record<string, (value: string) => [string, string][]> = {
  padding: (value) => box("padding-", value),
  margin: (value) => box("margin-", value),
  "padding-inline": (value) => pair(["padding-left", "padding-right"], value),
  "padding-block": (value) => pair(["padding-top", "padding-bottom"], value),
  "margin-inline": (value) => pair(["margin-left", "margin-right"], value),
  "margin-block": (value) => pair(["margin-top", "margin-bottom"], value),
};
// Logical longhands in a horizontal, left-to-right writing mode.
const LOGICAL: Record<string, string> = {
  "padding-inline-start": "padding-left",
  "padding-inline-end": "padding-right",
  "padding-block-start": "padding-top",
  "padding-block-end": "padding-bottom",
  "margin-inline-start": "margin-left",
  "margin-inline-end": "margin-right",
  "margin-block-start": "margin-top",
  "margin-block-end": "margin-bottom",
};

function box(prefix: string, value: string): [string, string][] {
  const parts = value.split(/\s+/);
  const [top, right = top, bottom = top, left = right] = parts;
  return BOX.map((side, index) => [prefix + side, [top, right, bottom, left][index]!]);
}

function pair(longhands: string[], value: string): [string, string][] {
  const [first, second = first] = value.split(/\s+/);
  return [
    [longhands[0]!, first!],
    [longhands[1]!, second!],
  ];
}

/** The longhands a declaration sets. */
export function expand(property: string, value: string): [string, string][] {
  const shorthand = SHORTHANDS[property];
  if (shorthand) return shorthand(value);
  return [[LOGICAL[property] ?? property, value]];
}

// `value` with each `var()` replaced by the custom property it names, or its fallback, or null where neither is there,
// which makes the declaration invalid at computed-value time.
function substitute(value: string, custom: (name: string) => string | undefined): string | null {
  const start = value.indexOf("var(");
  if (start < 0) return value;
  const inside = closing(value, start + 3);
  const [name, ...fallback] = until(inside, 0, ",", true);
  const replacement =
    custom(name!.trim()) ?? (fallback.length > 0 ? substitute(fallback.join(",").trim(), custom) : null);
  if (replacement === null) return null;
  const rest = substitute(value.slice(start + 4 + inside.length + 1), custom);
  return rest === null ? null : value.slice(0, start) + replacement + rest;
}

// The text inside the brackets that open at `open`.
function closing(text: string, open: number): string {
  let depth = 0;
  for (let index = open; index < text.length; index++) {
    const char = text[index]!;
    if (char === "\\") index++;
    else if (char === '"' || char === "'") {
      for (index++; index < text.length && text[index] !== char; index++) if (text[index] === "\\") index++;
    } else if (char === "(") depth++;
    else if (char === ")" && --depth === 0) return text.slice(open + 1, index);
  }
  throw new Error(`no ) closes ${JSON.stringify(text.slice(open))}`);
}

// --- Parsing -----------------------------------------------------------------------------------------------------

type Node =
  | { kind: "statement"; names: string[] }
  | { kind: "block"; prelude: string; children: Node[] }
  | { kind: "rule"; selector: string; declarations: [string, string][] };

function parse(css: string): Node[] {
  let index = 0;
  const skipComment = () => {
    while (css.startsWith("/*", index)) {
      const end = css.indexOf("*/", index + 2);
      index = end < 0 ? css.length : end + 2;
    }
  };
  const nodes = (closing: boolean): Node[] => {
    const result: Node[] = [];
    let text = "";
    while (index < css.length) {
      skipComment();
      const char = css[index]!;
      if (char === '"' || char === "'") {
        const end = css.indexOf(char, index + 1);
        text += css.slice(index, end + 1);
        index = end + 1;
        continue;
      }
      if (char === "}") {
        index++;
        if (closing) return result;
        continue;
      }
      if (char === ";") {
        index++;
        const prelude = text.trim();
        text = "";
        if (prelude.startsWith("@layer")) {
          result.push({
            kind: "statement",
            names: prelude
              .slice(6)
              .split(",")
              .map((name) => name.trim()),
          });
        }
        continue;
      }
      if (char === "{") {
        index++;
        const prelude = text.trim();
        text = "";
        if (prelude.startsWith("@")) {
          result.push({ kind: "block", prelude, children: nodes(true) });
        } else {
          const body = until(css, index, "}");
          index += body.length + 1;
          const declarations = until(body, 0, ";", true)
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part): [string, string] => {
              const colon = part.indexOf(":");
              return [part.slice(0, colon).trim(), part.slice(colon + 1).trim()];
            });
          result.push({ kind: "rule", selector: prelude, declarations });
        }
        continue;
      }
      text += char;
      index++;
    }
    return result;
  };
  return nodes(false);
}

// The text from `start` up to the first `stop` outside strings and brackets, or with `all`, every part between stops.
function until(text: string, start: number, stop: string, all: true): string[];
function until(text: string, start: number, stop: string): string;
function until(text: string, start: number, stop: string, all = false): string | string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = start;
  for (let index = start; index < text.length; index++) {
    const char = text[index]!;
    if (char === "\\") index++;
    else if (char === '"' || char === "'") {
      for (index++; index < text.length && text[index] !== char; index++) if (text[index] === "\\") index++;
    } else if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth--;
    else if (char === stop && depth === 0) {
      if (!all) return text.slice(start, index);
      parts.push(text.slice(from, index));
      from = index + 1;
    }
  }
  if (!all) throw new Error(`no ${stop} after ${JSON.stringify(text.slice(start, start + 40))}`);
  return [...parts, text.slice(from)];
}

// --- Layers ------------------------------------------------------------------------------------------------------

// Each layer's sublayers in the order they were first named; "" is the top level.
type Layers = Map<string, string[]>;

function declare(layers: Layers, path: string[]): void {
  for (let depth = 0; depth < path.length; depth++) {
    const parent = path.slice(0, depth).join(".");
    const children = layers.get(parent) ?? [];
    if (!children.includes(path[depth]!)) children.push(path[depth]!);
    layers.set(parent, children);
  }
}

// Positive when layer `a` wins over layer `b`. Unlayered styles, and those directly in a layer, win over its
// sublayers.
function compareLayers(layers: Layers, a: string[] | null, b: string[] | null): number {
  const left = a ?? [];
  const right = b ?? [];
  for (let depth = 0; ; depth++) {
    const x = left[depth];
    const y = right[depth];
    if (x === undefined && y === undefined) return 0;
    if (x === undefined) return 1;
    if (y === undefined) return -1;
    if (x !== y) {
      const siblings = layers.get(left.slice(0, depth).join("."))!;
      return siblings.indexOf(x) - siblings.indexOf(y);
    }
  }
}

// --- Media queries -----------------------------------------------------------------------------------------------

const px = (length: string) => parseFloat(length) * (/r?em$/.test(length) ? 16 : 1);

// A media query list per Media Queries 4: each query an optional `not` or `only`, an optional media type, and features
// joined by `and`. Anything else throws, so a query the oracle cannot read never passes for one that matches.
function mediaMatches(query: string, state: ElementState): boolean {
  return query.split(",").some((part) => {
    const match = /^\s*(?:(not|only)\s+)?(?:(all|screen|print)\s*)?((?:(?:^|and)\s*\([^()]*\)\s*)*)$/i.exec(part);
    if (!match || (match[1] && !match[2]) || (!match[2] && !match[3])) {
      throw new Error(`unsupported media query ${JSON.stringify(part)}`);
    }
    if (match[2] && match[3] && !/^and/i.test(match[3]))
      throw new Error(`unsupported media query ${JSON.stringify(part)}`);
    const print = state.media?.has("print") ?? false;
    const type = !match[2] || match[2].toLowerCase() === "all" || (match[2].toLowerCase() === "print") === print;
    const features = [...match[3]!.matchAll(/\(([^)]*)\)/g)].every(([, feature]) =>
      featureMatches(feature!.trim(), state),
    );
    return (type && features) !== (match[1]?.toLowerCase() === "not");
  });
}

function featureMatches(feature: string, state: ElementState): boolean {
  let match = /^(min|max)-width\s*:\s*([\d.]+\w*)$/.exec(feature);
  if (match) return match[1] === "min" ? state.width >= px(match[2]!) : state.width <= px(match[2]!);
  match = /^width\s*(>=|<=|>|<)\s*([\d.]+\w*)$/.exec(feature);
  if (match) {
    const length = px(match[2]!);
    return {
      ">=": state.width >= length,
      "<=": state.width <= length,
      ">": state.width > length,
      "<": state.width < length,
    }[match[1] as ">=" | "<=" | ">" | "<"];
  }
  return state.media?.has(feature.replace(/\s*:\s*/, ": ")) ?? false;
}

// --- Selectors ---------------------------------------------------------------------------------------------------

type Simple = { kind: "class" | "attribute" | "pseudo" | "element" | "type"; name: string; value?: string };

function simples(compound: string): Simple[] {
  const result: Simple[] = [];
  const pattern = /\.([\w-]+)|\[([\w-]+)(?:=("?)([^\]"]*)\3)?\]|::?([\w-]+)(\([^)]*\))?|([a-z][\w-]*|\*)/gy;
  for (const match of compound.matchAll(pattern)) {
    if (match[1]) result.push({ kind: "class", name: match[1] });
    else if (match[2]) result.push({ kind: "attribute", name: match[2], value: match[4] });
    else if (match[5]) {
      const element = match[0].startsWith("::") || ["before", "after"].includes(match[5]);
      result.push({ kind: element ? "element" : "pseudo", name: match[5] + (match[6] ?? "") });
    } else result.push({ kind: "type", name: match[7]! });
  }
  return result;
}

function specificityOf(selector: string): [number, number, number] {
  const counts: [number, number, number] = [0, 0, 0];
  for (const compound of selector.split(/\s*[\s>+~]\s*/)) {
    for (const simple of simples(compound)) {
      if (simple.kind === "class" || simple.kind === "attribute" || simple.kind === "pseudo") counts[1]++;
      else if (simple.kind === "element" || (simple.kind === "type" && simple.name !== "*")) counts[2]++;
    }
  }
  return counts;
}

function compoundMatches(list: Simple[], state: ElementState, self: boolean): boolean {
  return list.every((simple) => {
    switch (simple.kind) {
      case "class":
        return self ? state.classes.has(simple.name) : (state.ancestors?.has(simple.name) ?? false);
      case "attribute":
        return (
          self &&
          simple.name in (state.attributes ?? {}) &&
          (simple.value === undefined || state.attributes![simple.name] === simple.value)
        );
      case "pseudo":
        return self && (state.pseudo?.has(simple.name) ?? false);
      default:
        return false;
    }
  });
}

// Whether a selector selects the element itself: its last compound matches the element, and every compound before a
// descendant combinator matches one of its ancestors.
function selectorMatches(selector: string, state: ElementState): boolean {
  return selector.split(",").some((one) => {
    const compounds = one.trim().split(/\s+/);
    if (compounds.some((compound) => /[>+~]/.test(compound))) return false;
    const last = simples(compounds.at(-1)!);
    return (
      compoundMatches(last, state, true) &&
      compounds.slice(0, -1).every((compound) => compoundMatches(simples(compound), state, false))
    );
  });
}

// --- Cascade -----------------------------------------------------------------------------------------------------

/** The value each longhand computes to on the element, from style sheets given in document order. */
export function computed(sheets: readonly string[], state: ElementState): Record<string, string> {
  const layers: Layers = new Map();
  const declarations: Declaration[] = [];
  let order = 0;
  const walk = (nodes: Node[], layer: string[] | null, applies: boolean) => {
    for (const node of nodes) {
      if (node.kind === "statement") {
        for (const name of node.names) declare(layers, [...(layer ?? []), ...name.split(".")]);
      } else if (node.kind === "block") {
        const [, name = "", prelude = ""] = /^@([\w-]+)\s*([\s\S]*)$/.exec(node.prelude) ?? [];
        if (name === "layer") {
          const path = [...(layer ?? []), ...prelude.split(".")];
          declare(layers, path);
          walk(node.children, path, applies);
        } else if (name === "media") {
          walk(node.children, layer, applies && mediaMatches(prelude, state));
        } else {
          walk(node.children, layer, false);
        }
      } else {
        if (!applies || !selectorMatches(node.selector, state)) continue;
        for (const [property, value] of node.declarations) {
          // An empty value is no value but for a custom property, so the declaration is dropped as it is parsed.
          if (value === "" && !property.startsWith("--")) continue;
          declarations.push({ property, value, layer, specificity: specificityOf(node.selector), order: ++order });
        }
      }
    }
  };
  for (const sheet of sheets) walk(parse(sheet), null, true);
  for (const [property, value] of Object.entries(state.style ?? {})) {
    declarations.push({ property, value, layer: null, specificity: [0, 0, 0], order: ++order, inline: true });
  }

  // Custom properties first, which the other declarations read: as declared, or as the parent computes them.
  const winners = new Map<string, Declaration>();
  for (const declaration of declarations) {
    const current = winners.get(declaration.property);
    if (!current || wins(layers, declaration, current)) winners.set(declaration.property, declaration);
  }
  const custom: Record<string, string> = {};
  const resolving = new Set<string>();
  // A custom property in a cycle, or reading one that is not there, is not there either.
  const lookup = (name: string): string | undefined => {
    if (name in custom || !name.startsWith("--")) return custom[name];
    const declaration = winners.get(name);
    if (!declaration) {
      const inherited = state.parent?.[name];
      if (inherited !== undefined) custom[name] = inherited;
      return inherited;
    }
    if (resolving.has(name)) return undefined;
    resolving.add(name);
    const value = substitute(declaration.value.trim(), lookup);
    resolving.delete(name);
    if (value !== null) custom[name] = value;
    return value ?? undefined;
  };
  for (const property of [...winners.keys(), ...Object.keys(state.parent ?? {})]) lookup(property);

  const longhands = new Map<string, Declaration & { unset?: boolean }>();
  for (const declaration of declarations) {
    if (declaration.property.startsWith("--")) continue;
    // A value whose `var()` reads nothing is invalid only once computed, after it has won: its longhands are unset.
    const value = substitute(declaration.value, lookup);
    const unset = value === null || value.trim() === "";
    const parts = unset
      ? expand(declaration.property, "unset").map(([longhand]): [string, string] => [longhand, ""])
      : expand(declaration.property, value);
    for (const [longhand, longhandValue] of parts) {
      const current = longhands.get(longhand);
      const candidate = { ...declaration, property: longhand, value: longhandValue, unset };
      if (!current || wins(layers, candidate, current)) longhands.set(longhand, candidate);
    }
  }
  const values: Record<string, string> = { ...custom };
  for (const [longhand, { value, unset }] of longhands) if (!unset) values[longhand] = value;
  for (const property of INHERITED) {
    const inherited = state.parent?.[property];
    if (inherited !== undefined && (!longhands.has(property) || longhands.get(property)!.unset)) {
      values[property] = inherited;
    }
  }
  return Object.fromEntries(Object.entries(values).sort(([a], [b]) => (a < b ? -1 : 1)));
}

function wins(layers: Layers, a: Declaration, b: Declaration): boolean {
  if (Boolean(a.inline) !== Boolean(b.inline)) return Boolean(a.inline);
  const layer = compareLayers(layers, a.layer, b.layer);
  if (layer !== 0) return layer > 0;
  for (let index = 0; index < 3; index++) {
    if (a.specificity[index] !== b.specificity[index]) return a.specificity[index]! > b.specificity[index]!;
  }
  return a.order > b.order;
}
