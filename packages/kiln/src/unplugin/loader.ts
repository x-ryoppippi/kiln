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
export default function kilnLoader(this: LoaderContext, code: string, map?: unknown): void {
  const result = transform(code, this.resourcePath, { ...this.getOptions(), extract: false });
  for (const message of result?.warnings ?? []) this.emitWarning?.(new Error("[kiln] " + message));
  if (result) this.callback(null, result.code, result.map);
  else this.callback(null, code, map);
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;

  const warnings: string[] = [];
  const run = (code: string, options: TransformOptions = {}, map?: unknown) => {
    const calls: unknown[][] = [];
    kilnLoader.call(
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

  describe("kilnLoader", () => {
    it("passes the compiled code and its source map to the callback", () => {
      const [error, code, map] = run(`export const A = () => <div css={{ color: 'red' }} />`);
      expect(error).toBeNull();
      expect(code).toContain("css={_kiln$0}");
      expect(map).toMatchObject({ sources: ["/src/a.tsx"] });
    });

    it("inserts rules at runtime even when extraction is requested", () => {
      const [, code] = run(`export const A = () => <div css={{ color: 'red' }} />`, { extract: true });
      expect(code).not.toContain("/__kiln/");
      expect(code).toContain("{color:red}");
    });

    it("forwards the other options", () => {
      const source = `import { css } from 'my-kiln'\ncss({ color: 'red' })`;
      expect(run(source, { importSource: "my-kiln" })[1]).toContain(`from "my-kiln"`);
      expect(run(`export const A = () => <div css={{ color: 'red' }} />`, { cssProp: false })[1]).not.toContain(
        "_kiln$",
      );
    });

    it("reports unranked conditions and !important values as loader warnings", () => {
      warnings.length = 0;
      run(`export const A = () => <div css={{ ".dark &": { color: "red !important" } }} />`);
      expect(warnings).toEqual([
        expect.stringMatching(/^\[kiln\] "color: red !important" is !important/),
        expect.stringMatching(/^\[kiln\] ".dark &" is not in conditions.order/),
      ]);
    });

    it("configures the runtime in every module that leaves styles to it, since it has no config module", () => {
      const conditions = { breakpoints: ["600px"] };
      const [, code] = run(`export const A = (p) => <div css={p.styles} />`, { conditions });
      expect(code).toContain(`import { __c as _kiln$c } from "kiln";\n_kiln$c({"breakpoints":["600px"]},`);
    });

    it("passes through code and the incoming map when there is nothing to compile", () => {
      const map = { version: 3, mappings: "" };
      expect(run(`export const x = 1`, {}, map)).toEqual([null, `export const x = 1`, map]);
    });
  });
}
