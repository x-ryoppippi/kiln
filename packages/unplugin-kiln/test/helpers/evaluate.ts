import * as kiln from "kiln";
import MagicString from "magic-string";
import { parseSync } from "oxc-parser";

/**
 * Run an ES module that only imports from `kiln`, returning its named exports.
 * Evaluating in memory keeps tests from writing next to their inputs, which would defeat the `vp run` cache.
 */
export function evaluate(code: string, id = "module.js"): Record<string, any> {
  const { program, errors } = parseSync(id, code);
  if (errors.length > 0) throw new Error(errors.map((error) => error.message).join("\n"));

  const s = new MagicString(code);
  const exported: string[] = [];
  for (const node of program.body) {
    if (node.type === "ImportDeclaration") {
      if (node.source.value !== "kiln") throw new Error(`unexpected import from ${node.source.value}`);
      const bindings = node.specifiers.map((specifier) => {
        if (specifier.type !== "ImportSpecifier") throw new Error("only named imports are supported");
        const imported = specifier.imported.type === "Identifier" ? specifier.imported.name : specifier.imported.value;
        return `${imported}: ${specifier.local.name}`;
      });
      s.overwrite(node.start, node.end, `const { ${bindings.join(", ")} } = kiln;`);
    } else if (node.type === "ExportNamedDeclaration" && node.declaration?.type === "VariableDeclaration") {
      for (const declarator of node.declaration.declarations) {
        if (declarator.id.type === "Identifier") exported.push(declarator.id.name);
      }
      s.remove(node.start, node.declaration.start);
    }
  }

  // oxlint-disable-next-line typescript/no-implied-eval -- running the compiled module is the point
  return new Function("kiln", `${s.toString()}\nreturn { ${exported.join(", ")} };`)(kiln);
}
