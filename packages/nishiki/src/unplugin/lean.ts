import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const NISHIKI = "@nishikijs/react";

/** What an import source exports beside its full entries, so compiled modules in a client build can leave the compiler out. */
export const LEAN_SUBPATHS = ["./lean", "./lean/jsx-runtime", "./lean/jsx-dev-runtime", "./compiler"] as const;

const checked = new Map<string, boolean>();

// Whether a package's `exports` field has `subpath`, written out or through a `*` pattern.
function exported(exports: unknown, subpath: string): boolean {
  if (typeof exports !== "object" || exports === null || Array.isArray(exports)) return false;
  return Object.entries(exports).some(([key, target]) => {
    if (target === null) return false;
    if (key === subpath) return true;
    const star = key.indexOf("*");
    if (star === -1) return false;
    const [prefix, suffix] = [key.slice(0, star), key.slice(star + 1)];
    return subpath.length >= prefix.length + suffix.length && subpath.startsWith(prefix) && subpath.endsWith(suffix);
  });
}

const readManifest = (file: string): { name?: string; exports?: unknown } => JSON.parse(readFileSync(file, "utf8"));

// The manifest of package `name` as `from` finds it: in a node_modules directory above it, or, when `from` belongs to the
// package itself, its own. Bun has no `module.findPackageJSON`.
function manifestOf(name: string, from: string): string | null {
  for (let dir = path.dirname(from); ; dir = path.dirname(dir)) {
    const own = path.join(dir, "package.json");
    if (existsSync(own) && readManifest(own).name === name) return own;
    const installed = path.join(dir, "node_modules", name, "package.json");
    if (existsSync(installed)) return installed;
    if (path.dirname(dir) === dir) return null;
  }
}

// The lean entries `importSource` lacks, relative to it, as the package `from` imports has them; all of them when it
// cannot be found.
export function missingLeanEntries(importSource: string, from: string): string[] {
  const name = importSource
    .split("/")
    .slice(0, importSource.startsWith("@") ? 2 : 1)
    .join("/");
  const subpathOf = (entry: string) => "." + importSource.slice(name.length) + entry.slice(1);
  try {
    const manifest = manifestOf(name, from);
    if (!manifest) return [...LEAN_SUBPATHS];
    const { exports } = readManifest(manifest);
    if (exports !== undefined) return LEAN_SUBPATHS.filter((entry) => !exported(exports, subpathOf(entry)));
    const require = createRequire(manifest);
    return LEAN_SUBPATHS.filter((entry) => {
      try {
        require.resolve(name + subpathOf(entry).slice(1));
        return false;
      } catch {
        return true;
      }
    });
  } catch {
    return [...LEAN_SUBPATHS];
  }
}

/**
 * Whether modules that import `importSource` can load its lean entries, checked once per import source from the first
 * module that asks. Warns when an import source other than nishiki lacks them, and the build keeps its full entries.
 */
export function hasLeanEntries(
  importSource: string | undefined,
  from: string,
  warn: (message: string) => void,
): boolean {
  if (importSource === undefined || importSource === NISHIKI) return true;
  let result = checked.get(importSource);
  if (result === undefined) {
    const missing = missingLeanEntries(importSource, from.replace(/[?#].*$/, ""));
    result = missing.length === 0;
    checked.set(importSource, result);
    if (!result) {
      warn(
        `[nishiki] ${importSource} does not export ${missing.map((subpath) => importSource + subpath.slice(1)).join(", ")}, ` +
          `so modules that import it load nishiki's full runtime. Re-export ${LEAN_SUBPATHS.map((subpath) => NISHIKI + subpath.slice(1)).join(", ")} under the same subpaths to leave the compiler out.`,
      );
    }
  }
  return result;
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;
  const { mkdtemp, mkdir, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");

  // A package named acme, installed in node_modules above the module that imports it, or, with `own`, the package the
  // module belongs to.
  async function withPackage(
    manifest: object,
    files: string[],
    run: (from: string) => void,
    { own = false }: { own?: boolean } = {},
  ) {
    const dir = await mkdtemp(path.join(tmpdir(), "nishiki-wrapper-"));
    try {
      const root = own ? dir : path.join(dir, "node_modules", "acme");
      for (const file of ["package.json", ...files])
        await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "acme", ...manifest }));
      for (const file of files) await writeFile(path.join(root, file), "");
      await mkdir(path.join(dir, "src"));
      run(path.join(dir, "src", "app.tsx"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  describe("missingLeanEntries", () => {
    it("finds the lean entries and the compiler in a wrapper's exports, written out or through a pattern", async () => {
      const entries = Object.fromEntries(LEAN_SUBPATHS.map((subpath) => [subpath, { import: subpath + ".js" }]));
      await withPackage({ exports: { ".": "./index.js", ...entries } }, [], (from) =>
        expect(missingLeanEntries("acme", from)).toEqual([]),
      );
      await withPackage({ exports: { ".": "./index.js", "./*": "./dist/*.js" } }, [], (from) =>
        expect(missingLeanEntries("acme", from)).toEqual([]),
      );
      await withPackage({ exports: { ".": "./index.js", "./lean/*": "./lean/*.js", "./lean": null } }, [], (from) =>
        expect(missingLeanEntries("acme", from)).toEqual(["./lean", "./compiler"]),
      );
    });

    it("resolves the entries of a package without exports as files", async () => {
      const files = ["index.js", "lean/index.js", "lean/jsx-runtime.js", "lean/jsx-dev-runtime.js", "compiler.js"];
      await withPackage({ main: "index.js" }, files, (from) => expect(missingLeanEntries("acme", from)).toEqual([]));
      await withPackage({ main: "index.js" }, ["index.js", "lean/index.js"], (from) =>
        expect(missingLeanEntries("acme", from)).toEqual([
          "./lean/jsx-runtime",
          "./lean/jsx-dev-runtime",
          "./compiler",
        ]),
      );
    });

    it("finds the entries of an import source that is a subpath of its package, or the importer's own package", async () => {
      const subpaths = {
        ".": "./index.js",
        "./styles": "./s.js",
        "./styles/*": "./s/*.js",
        "./styles/compiler": "./c.js",
      };
      await withPackage({ exports: subpaths }, [], (from) =>
        expect(missingLeanEntries("acme/styles", from)).toEqual([]),
      );
      await withPackage(
        { exports: { ".": "./index.js", "./*": "./*.js" } },
        [],
        (from) => expect(missingLeanEntries("acme", from)).toEqual([]),
        { own: true },
      );
    });

    it("misses every entry of an import source it cannot find", async () => {
      await withPackage({}, [], (from) => expect(missingLeanEntries("missing", from)).toEqual([...LEAN_SUBPATHS]));
    });
  });

  describe("hasLeanEntries", () => {
    it("trusts nishiki's own entries, and warns once about a wrapper without them", async () => {
      const warnings: string[] = [];
      const warn = (message: string) => warnings.push(message);
      expect(hasLeanEntries(undefined, "/app/src/a.tsx", warn)).toBe(true);
      expect(hasLeanEntries(NISHIKI, "/app/src/a.tsx", warn)).toBe(true);
      await withPackage({ exports: { ".": "./index.js" } }, [], (from) => {
        expect(hasLeanEntries("acme", from, warn)).toBe(false);
        expect(hasLeanEntries("acme", from, warn)).toBe(false);
      });
      expect(warnings).toEqual([
        "[nishiki] acme does not export acme/lean, acme/lean/jsx-runtime, acme/lean/jsx-dev-runtime, acme/compiler, so " +
          "modules that import it load nishiki's full runtime. Re-export @nishikijs/react/lean, " +
          "@nishikijs/react/lean/jsx-runtime, @nishikijs/react/lean/jsx-dev-runtime, @nishikijs/react/compiler under the " +
          "same subpaths to leave the compiler out.",
      ]);
      checked.clear();
    });
  });
}
