import { mkdir, rm, writeFile } from "node:fs/promises";

import { register, type Plugin } from "unloader";
import kiln from "unplugin-kiln/unloader";
import oxc from "unplugin-oxc/unloader";

const extract = process.env.KILN_EXTRACT === "1";
const dir = extract ? "dist-extract" : "dist";

// Node cannot evaluate CSS, so record each imported stylesheet and hand Node an empty module instead.
function cssCollect(sheets: Map<string, string>): Plugin {
  return {
    name: "css-collect",
    transform: {
      filter: { id: /\.css$/ },
      handler(code, id) {
        sheets.set(id, typeof code === "string" ? code : new TextDecoder().decode(code));
        return { code: "export {};", format: "module" };
      },
    },
  };
}

const sheets = new Map<string, string>();
// unloader runs hooks in array order and ignores `enforce`, so kiln must see the TSX before oxc compiles its JSX away.
register({
  plugins: [
    kiln({ extract }),
    oxc({ transform: { jsx: { runtime: "automatic", importSource: "kiln" } } }),
    cssCollect(sheets),
  ],
});

const { render } = await import("./src/main.tsx");

await rm(dir, { recursive: true, force: true });
await mkdir(dir);
const stylesheets = sheets.size > 0 ? ["main.css"] : [];
if (sheets.size > 0) await writeFile(`${dir}/main.css`, [...sheets.values()].join("\n"));
await writeFile(`${dir}/index.html`, render(stylesheets));
