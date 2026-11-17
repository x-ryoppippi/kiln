import { describe, expect, it } from "vite-plus/test";

import { compileModule } from "../../src/unplugin/transform.ts";

describe("class names that collide", () => {
  // djb2 hashes these two rules alike.
  const tall = `import { css } from "@nishikijs/react";\nexport const a = css({ height: "7044px" });\n`;
  const short = `import { css } from "@nishikijs/react";\nexport const b = css({ height: "2100.11rem" });\n`;

  it.each([{}, { extract: true }])("fail the build, naming both rules and their modules, with %o", async (options) => {
    const { unplugin } = await import("../../src/unplugin/index.ts");
    const { transform } = unplugin.raw(options, { framework: "rollup", versions: {} });
    if (typeof transform !== "object") throw new Error("expected an object hook");
    const run = (code: string, id: string) => Reflect.apply(transform.handler, { warn: () => {} }, [code, id]);
    run(tall, "/src/a.js");
    run(tall, "/src/c.js");
    expect(() => run(short, "/src/b.js")).toThrow(
      /^\[nishiki\] the rules @layer nishiki\.n0\{\.n279bed\{height:7044px\}\} and @layer nishiki\.n0\{\.n279bed\{height:2100\.11rem\}\} \(in \/src\/a\.js and \/src\/b\.js\) have the same class name, n279bed/,
    );
  });

  it("fail a module that compiles both", () => {
    const both = `import { css } from "@nishikijs/react";\nexport const a = css({ height: "7044px" }, { height: "2100.11rem" });\n`;
    expect(() => compileModule(both, "/src/a.js", {}, { cssImport: true, configImport: false, lean: false })).toThrow(
      /have the same class name, n279bed/,
    );
  });
});
