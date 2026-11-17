// What every element of server-rendered markup computes to, as the cascade oracle computes it from the rules a page has.
import { computed, type ElementState } from "../../oracle/cascade.ts";

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "wbr"]);
const TAG = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
const ENTITIES: Record<string, string> = { "&quot;": '"', "&#x27;": "'", "&lt;": "<", "&gt;": ">", "&amp;": "&" };

const decode = (text: string) => text.replace(/&(?:quot|#x27|lt|gt|amp);/g, (entity) => ENTITIES[entity]!);
const attribute = (attributes: string, name: string) =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(attributes)?.[1] ?? undefined;

/** The declarations of a style attribute as React writes it, `property:value;…`. */
export function inlineStyle(text: string): Record<string, string> {
  const style: Record<string, string> = {};
  for (const declaration of decode(text).split(";")) {
    const colon = declaration.indexOf(":");
    if (colon > 0) style[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim();
  }
  return style;
}

/**
 * The tag and computed values of each element in `markup`, in document order, each inheriting from its parent. Custom
 * properties whose names start with `--n-` are nishiki's own, which only compiled output sets, so they are left out.
 */
export function computedElements(
  markup: string,
  sheets: readonly string[],
  state: Omit<ElementState, "classes"> = { width: 1000 },
): { tag: string; values: Record<string, string> }[] {
  const elements: { tag: string; values: Record<string, string> }[] = [];
  const parents: (Record<string, string> | undefined)[] = [state.parent];
  for (const [, closing, tag, attributes, selfClosing] of markup
    .replace(/<style[^>]*>.*?<\/style>/gs, "")
    .matchAll(TAG)) {
    if (closing) {
      parents.pop();
      continue;
    }
    const className = attribute(attributes!, "class");
    const style = attribute(attributes!, "style");
    const values = computed(sheets, {
      ...state,
      classes: new Set(className ? decode(className).split(" ") : []),
      style: style === undefined ? undefined : inlineStyle(style),
      parent: parents.at(-1),
    });
    elements.push({
      tag: tag!,
      values: Object.fromEntries(Object.entries(values).filter(([property]) => !property.startsWith("--n-"))),
    });
    if (!selfClosing && !VOID.has(tag!)) parents.push(values);
  }
  return elements;
}
