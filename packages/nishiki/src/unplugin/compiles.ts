import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE: RegExp = /\.[cm]?[jt]sx?(?:$|\?)/;
export const DEPENDENCY: RegExp = /[\\/]node_modules[\\/]/;

// nishiki's own runtime, which a workspace links outside node_modules: it reads `css` keys that are not styles.
function packageRoot(file: string): string {
  let dir = path.dirname(file);
  while (!existsSync(path.join(dir, "package.json")) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  return dir;
}
export const OWN: RegExp = new RegExp(
  "^" +
    packageRoot(fileURLToPath(import.meta.url))
      .split(/[\\/]/)
      .map((part) => RegExp.escape(part))
      .join("[\\\\/]+") +
    "[\\\\/]+(?:dist|src)[\\\\/]",
);
export const TRANSFORM_FILTER: { id: { include: RegExp; exclude: RegExp[] } } = {
  id: { include: SOURCE, exclude: [DEPENDENCY, OWN] },
};

/** Whether nishiki compiles the module `id`: a source module of the app, not a dependency or nishiki itself. */
export const compiles = (id: string): boolean =>
  !id.startsWith("\0") && SOURCE.test(id) && !DEPENDENCY.test(id) && !OWN.test(id);
