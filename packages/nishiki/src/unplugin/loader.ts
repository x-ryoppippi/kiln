import { transform, type TransformOptions } from "./transform.ts";

interface LoaderContext {
  resourcePath: string;
  getOptions(): TransformOptions;
  emitWarning?(warning: Error): void;
  callback(error: Error | null, code?: string, map?: unknown): void;
}

/**
 * A webpack-compatible loader for bundlers unplugin cannot drive, such as Turbopack.
 * Loaders cannot add virtual modules, so rules are always inserted at runtime.
 */
export default function nishikiLoader(this: LoaderContext, code: string, map?: unknown): void {
  const result = transform(code, this.resourcePath, { ...this.getOptions(), extract: false });
  for (const message of result?.warnings ?? []) this.emitWarning?.(new Error(message));
  if (result) this.callback(null, result.code, result.map);
  else this.callback(null, code, map);
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;

  const warnings: string[] = [];
  const run = (code: string, options: TransformOptions = {}, map?: unknown) => {
    const calls: unknown[][] = [];
    nishikiLoader.call(
      {
        resourcePath: "/src/a.tsx",
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
      expect(code).toContain("{color:red}");
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

    it("passes through code and the incoming map when there is nothing to compile", () => {
      const map = { version: 3, mappings: "" };
      expect(run(`export const x = 1`, {}, map)).toEqual([null, `export const x = 1`, map]);
    });
  });
}
