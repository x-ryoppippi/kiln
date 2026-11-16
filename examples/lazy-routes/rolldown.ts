import { writeFile } from "node:fs/promises";

import { build } from "rolldown";
import { MANIFEST } from "@nishikijs/react/unplugin";
import nishiki from "@nishikijs/react/unplugin/rolldown";

import { extract, outDir, page } from "./page.ts";

const dir = outDir("rolldown");
const { output } = await build({
  input: "src/main.tsx",
  output: { dir, minify: true, entryFileNames: "main.js", cleanDir: true },
  // JSX settings, including nishiki as the import source, come from tsconfig.json.
  transform: { define: { "process.env.NODE_ENV": '"production"' } },
  plugins: [nishiki({ extract })],
});

const manifest = output.find((file) => file.fileName === MANIFEST);
await writeFile(
  `${dir}/index.html`,
  page(manifest?.type === "asset" ? JSON.parse(String(manifest.source)) : {}, "main.js"),
);
