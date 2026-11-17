import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { packageRoot } from "./compiles.ts";

const CODE = /\.[cm]?[jt]sx?$/;
const TYPES = /\.d\.[cm]?ts$/;

/** A hash of the code under `dir`, which changes with any of it. */
export function hashCode(dir: string): string {
  const hash = createHash("sha256");
  const files = readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => CODE.test(file) && !TYPES.test(file))
    .map((file) => file.split(path.sep).join("/"))
    .sort();
  for (const file of files) {
    hash.update(file + "\0");
    hash.update(readFileSync(path.join(dir, file)));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

function version(): string {
  const self = fileURLToPath(import.meta.url);
  const root = packageRoot(self);
  // `dist` once published, `src` where a workspace runs the source: the compiler and the runtime its output calls.
  const code = path.join(root, path.relative(root, self).split(path.sep)[0]!);
  const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { version: string };
  return `${version}+${hashCode(code)}`;
}

/**
 * The build of nishiki that compiles: its version and a hash of its code. A persistent cache keys the modules it compiled
 * on it, since their code calls this build's runtime. A prerelease, a pkg.pr.new build or a workspace link can change the
 * code without the version.
 */
export const VERSION: string = version();

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;
  const { mkdir, mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");

  describe("VERSION", () => {
    it("is the package version and a hash of the code", async () => {
      const root = packageRoot(fileURLToPath(import.meta.url));
      const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
      expect(VERSION).toBe(`${version}+${hashCode(path.join(root, "src"))}`);
    });

    it("hashes changes to any code file, but not to types or other files", async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "nishiki-version-"));
      try {
        await mkdir(path.join(dir, "lean"));
        await writeFile(path.join(dir, "index.js"), "export const a = 1;");
        await writeFile(path.join(dir, "lean", "index.js"), "export const __k = () => {};");
        const before = hashCode(dir);
        await writeFile(path.join(dir, "index.d.ts"), "export declare const a: number;");
        await writeFile(path.join(dir, "README.md"), "# nishiki");
        expect(hashCode(dir)).toBe(before);
        await writeFile(path.join(dir, "lean", "index.js"), "export const __u = () => {};");
        expect(hashCode(dir)).not.toBe(before);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
}
