import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

// A stand-in for a route code splitter such as TanStack Router's: the module keeps what precedes the
// marker and loads the rest from a `?split=component` variant of itself, which keeps only the rest.
const MARKER = "// split:component\n";
const QUERY = "?split=component";

export function split(code: string, id: string): string {
  const at = code.indexOf(MARKER);
  if (at < 0) return code;
  if (id.endsWith(QUERY)) return code.slice(0, code.indexOf("\n") + 1) + code.slice(at + MARKER.length);
  const variant = JSON.stringify("./" + basename(id) + QUERY);
  return (
    code.slice(0, at) + `export const component = () => import(${variant}).then((module) => module.component());\n`
  );
}

/** The splitter as a Rollup-compatible plugin, placed before kiln. */
export function splitter() {
  return {
    name: "split",
    enforce: "pre" as const,
    resolveId(source: string, importer: string | undefined) {
      return source.endsWith(QUERY) && importer ? resolve(dirname(importer.replace(/[?#].*$/, "")), source) : null;
    },
    load(id: string) {
      return id.endsWith(QUERY) ? readFileSync(id.slice(0, -QUERY.length), "utf8") : null;
    },
    transform(code: string, id: string) {
      return split(code, id);
    },
  };
}

/** The splitter as a webpack and Rspack loader. */
export default function splitLoader(this: { resourcePath: string; resourceQuery: string }, code: string): string {
  return split(code, this.resourcePath + this.resourceQuery);
}
