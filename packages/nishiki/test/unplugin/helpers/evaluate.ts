import * as nishiki from "../../../src/index.ts";
import * as nishikiJSX from "../../../src/jsx-runtime.ts";
import * as lean from "../../../src/lean/index.ts";
import * as leanJSX from "../../../src/lean/jsx-runtime.ts";
import MagicString from "magic-string";
import { parseSync } from "oxc-parser";
import * as reactJSX from "react/jsx-runtime";

// What a module may import, by specifier.
const MODULES: Record<string, object> = {
  "@nishikijs/react": nishiki,
  "@nishikijs/react/jsx-runtime": nishikiJSX,
  "@nishikijs/react/lean": lean,
  "@nishikijs/react/lean/jsx-runtime": leanJSX,
  "react/jsx-runtime": reactJSX,
};

/**
 * Run an ES module that only imports nishiki's entries and React's JSX runtime, returning its named exports.
 * Evaluating in memory keeps tests from writing next to their inputs, which would defeat the `vp run` cache.
 */
export function evaluate(code: string, id = "module.js"): Record<string, any> {
  const { program, errors } = parseSync(id, code);
  if (errors.length > 0) throw new Error(errors.map((error) => error.message).join("\n"));

  const s = new MagicString(code);
  const exported: string[] = [];
  for (const node of program.body) {
    if (
      node.type === "ImportDeclaration" &&
      node.source.value === "@nishikijs/react/compiler" &&
      node.specifiers.length === 0
    ) {
      // `@nishikijs/react` already loads the compiler.
      s.remove(node.start, node.end);
    } else if (node.type === "ImportDeclaration") {
      if (!(node.source.value in MODULES)) throw new Error(`unexpected import from ${node.source.value}`);
      const bindings = node.specifiers.map((specifier) => {
        if (specifier.type !== "ImportSpecifier") throw new Error("only named imports are supported");
        const imported = specifier.imported.type === "Identifier" ? specifier.imported.name : specifier.imported.value;
        return `${JSON.stringify(imported)}: ${specifier.local.name}`;
      });
      s.overwrite(
        node.start,
        node.end,
        `const { ${bindings.join(", ")} } = modules[${JSON.stringify(node.source.value)}];`,
      );
    } else if (node.type === "ExportNamedDeclaration" && node.declaration?.type === "VariableDeclaration") {
      for (const declarator of node.declaration.declarations) {
        if (declarator.id.type === "Identifier") exported.push(declarator.id.name);
      }
      s.remove(node.start, node.declaration.start);
    }
  }

  // oxlint-disable-next-line typescript/no-implied-eval -- running the compiled module is the point
  return new Function("modules", `${s.toString()}\nreturn { ${exported.join(", ")} };`)(MODULES);
}
