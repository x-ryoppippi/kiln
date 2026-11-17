import { compiles } from "./compiles.ts";
import { leanEntriesChecker } from "./lean.ts";
import { compileModule, reportFallback, type TransformOptions } from "./transform.ts";

export interface LoaderOptions extends TransformOptions {
  /** Whether the loader compiles for a client bundle, whose compiled modules load the lean entries. */
  lean?: boolean;
  /**
   * The build of nishiki that wrote the rule. The loader ignores it: Turbopack keys its cache on a loader's options, not on
   * the loader's code, so a rule must change with nishiki for its compiled modules to.
   */
  version?: string;
}

// A loader has no instance of its own, so the checks last as long as the process that loads it.
const hasLeanEntries = leanEntriesChecker();

interface LoaderContext {
  resourcePath: string;
  getOptions(): LoaderOptions;
  emitWarning?(warning: Error): void;
  callback(error: Error | null, code?: string, map?: unknown): void;
}

/**
 * A webpack-compatible loader for bundlers unplugin cannot drive, such as Turbopack.
 * Loaders cannot add virtual modules, so rules are always inserted at runtime.
 */
export default function nishikiLoader(this: LoaderContext, code: string, map?: unknown): void {
  // A rule's conditions may still match nishiki's own runtime, as Turbopack's `not: "foreign"` does when a workspace
  // links it.
  if (!compiles(this.resourcePath)) return this.callback(null, code, map);
  const { lean: client = false, version: _, ...options } = this.getOptions();
  const warn = (message: string) => this.emitWarning?.(new Error(message));
  const lean = client && hasLeanEntries(options.importSource, this.resourcePath, warn);
  const result = compileModule(
    code,
    this.resourcePath,
    { ...options, extract: false },
    { cssImport: false, configImport: false, lean },
  );
  if (lean) reportFallback(this.resourcePath, result, options.runtime, warn);
  for (const message of result?.warnings ?? []) warn(message);
  if (result) this.callback(null, result.code, result.map);
  else this.callback(null, code, map);
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;

  const warnings: string[] = [];
  const run = (code: string, options: LoaderOptions = {}, map?: unknown, resourcePath = "/src/a.tsx") => {
    const calls: unknown[][] = [];
    nishikiLoader.call(
      {
        resourcePath,
        getOptions: () => options,
        emitWarning: (warning) => warnings.push(warning.message),
        callback: (...args) => calls.push(args),
      },
      code,
      map,
    );
    expect(calls).toHaveLength(1);
    return calls[0]!;
  };

  describe("nishikiLoader", () => {
    it("passes the compiled code and its source map to the callback", () => {
      const [error, code, map] = run(`export const A = () => <div css={{ color: 'red' }} />`);
      expect(error).toBeNull();
      expect(code).toContain("css={_nishiki$0}");
      expect(map).toMatchObject({ sources: ["/src/a.tsx"] });
    });

    it("inserts rules at runtime even when extraction is requested", () => {
      const [, code] = run(`export const A = () => <div css={{ color: 'red' }} />`, { extract: true });
      expect(code).not.toContain("/__nishiki/");
      expect(code).toContain(`["color",["red","n0"]]`);
    });

    it("forwards the other options", () => {
      const source = `import { css } from 'my-nishiki'\ncss({ color: 'red' })`;
      expect(run(source, { importSource: "my-nishiki" })[1]).toContain(`from "my-nishiki"`);
      expect(run(`export const A = () => <div css={{ color: 'red' }} />`, { cssProp: false })[1]).not.toContain(
        "_nishiki$",
      );
    });

    it("reports unranked conditions and !important values as loader warnings", () => {
      warnings.length = 0;
      run(`export const A = () => <div css={{ ".dark &": { color: "red !important" } }} />`);
      expect(warnings).toEqual([
        expect.stringMatching(/^\[nishiki\] "color: red !important" is !important/),
        expect.stringMatching(/^\[nishiki\] ".dark &" is not in conditions.order/),
      ]);
    });

    it("configures the runtime in every module that leaves styles to it, since it has no config module", () => {
      const conditions = { breakpoints: ["600px"] };
      const [, code] = run(`export const A = (p) => <div css={p.styles} />`, { conditions });
      expect(code).toContain(
        `import { __c as _nishiki$c } from "@nishikijs/react";\n_nishiki$c({"breakpoints":["600px"]},`,
      );
    });

    it("points a module compiled for the browser at the lean entries, and reports where it falls back", () => {
      const [, code] = run(`import { css } from '@nishikijs/react'\nexport const a = css({ color: 'red' })`, {
        lean: true,
      });
      expect(code).toMatch(
        /^\/\*\* @jsxImportSource react \*\/\nimport \{ __k as _nishiki\$ \} from "@nishikijs\/react\/lean";\n/,
      );
      expect(code).toContain(`import { css } from "@nishikijs/react/lean"`);

      warnings.length = 0;
      const fallback = `export const A = (p) => <div css={p.styles} />`;
      expect(run(fallback, { lean: true, runtime: "warn" })[1]).toContain(`import "@nishikijs/react/compiler";`);
      expect(warnings).toEqual([expect.stringMatching(/^\[nishiki\] \/src\/a\.tsx:1:35: a style that is not/)]);
      expect(() => run(fallback, { lean: true, runtime: "error" })).toThrow(/needs nishiki's compiler at runtime/);
      expect(run(fallback, { runtime: "error" })[1]).toBe(fallback);
    });

    it("leaves nishiki's own runtime and dependencies alone, as the plugin does", async () => {
      const { fileURLToPath } = await import("node:url");
      const map = { version: 3, mappings: "" };
      const own = fileURLToPath(new URL("../lean/jsx-runtime.ts", import.meta.url));
      const source = `export const a = (props) => props.css`;
      for (const resourcePath of [own, "/app/node_modules/lib/index.js"]) {
        expect(run(source, { lean: true }, map, resourcePath), resourcePath).toEqual([null, source, map]);
      }
    });

    it("passes through code and the incoming map when there is nothing to compile", () => {
      const map = { version: 3, mappings: "" };
      expect(run(`export const x = 1`, {}, map)).toEqual([null, `export const x = 1`, map]);
    });
  });
}
