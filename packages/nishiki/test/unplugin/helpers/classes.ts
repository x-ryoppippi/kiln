// A packed entry whose rules nishiki extracted keeps its key and class names, `[key, "n… n…"]`, in any quotes.
const EXTRACTED_ENTRY = /\[\s*(["'`])(?:\\.|(?!\1).)*?\1\s*,\s*(["'`])(n[0-9a-z]+(?: n[0-9a-z]+)*)\2\s*\]/g;

/** The classes of extracted rules that a bundle's JavaScript references. */
export const extractedClasses = (js: string): Set<string> =>
  new Set([...js.matchAll(EXTRACTED_ENTRY)].flatMap((match) => match[3]!.split(" ")));
