// The lazy-routes style objects in a form every library's syntax can be written from: values as CSS strings with
// their units, and nested keys split into `&`-relative selectors and media queries.
import type { Style, StyleValue } from "../gen-lazy-routes.ts";

export type Declaration = { property: string; value: string };
export type Block = {
  declarations: Declaration[];
  // `&:hover`, `&::backdrop`, `&[aria-current=page]`, ...
  selectors: { selector: string; block: Block }[];
  // The query without `@media`, such as `(max-width: 768px)`.
  media: { query: string; block: Block }[];
};

// React's unitless properties that the fixture can use; every other number is a length in pixels.
const UNITLESS = new Set(["fontWeight", "lineHeight", "zIndex", "opacity", "flex", "flexGrow", "flexShrink", "order"]);

export const kebab = (property: string): string => property.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

export function cssValue(property: string, value: StyleValue): string {
  if (typeof value === "string") return value;
  return UNITLESS.has(property) || value === 0 ? String(value) : `${value}px`;
}

export function canonical(style: Style): Block {
  const block: Block = { declarations: [], selectors: [], media: [] };
  for (const [key, value] of Object.entries(style)) {
    if (typeof value !== "object") block.declarations.push({ property: key, value: cssValue(key, value) });
    else if (key.startsWith("@media "))
      block.media.push({ query: key.slice("@media ".length), block: canonical(value) });
    else block.selectors.push({ selector: key.startsWith("&") ? key : `&${key}`, block: canonical(value) });
  }
  return block;
}

// An object literal of string values with `&` selectors and `@media` keys, as styled-components, Emotion and Panda
// take them.
export function objectSource(block: Block): string {
  const entries = [
    ...block.declarations.map(({ property, value }) => `${property}: ${JSON.stringify(value)}`),
    ...block.selectors.map(({ selector, block }) => `${JSON.stringify(selector)}: ${objectSource(block)}`),
    ...block.media.map(({ query, block }) => `${JSON.stringify(`@media ${query}`)}: ${objectSource(block)}`),
  ];
  return `{ ${entries.join(", ")} }`;
}

// CSS declarations with nested `&` rules and `@media` blocks, as Linaria's template literals take them.
export function cssText(block: Block): string {
  return [
    ...block.declarations.map(({ property, value }) => `${kebab(property)}: ${value};`),
    ...block.selectors.map(({ selector, block }) => `${selector} { ${cssText(block)} }`),
    ...block.media.map(({ query, block }) => `@media ${query} { ${cssText(block)} }`),
  ].join(" ");
}
