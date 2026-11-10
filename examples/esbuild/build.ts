import { writeFile } from "node:fs/promises";

import { build } from "esbuild";
import kiln from "unplugin-kiln/esbuild";

const extract = process.env.KILN_EXTRACT === "1";
const outdir = extract ? "dist-extract" : "dist";

const { metafile } = await build({
  entryPoints: ["src/main.tsx"],
  outdir,
  bundle: true,
  minify: true,
  format: "esm",
  jsx: "automatic",
  jsxImportSource: "kiln",
  define: { "process.env.NODE_ENV": '"production"' },
  metafile: true,
  plugins: [kiln({ extract })],
});

const stylesheets = Object.keys(metafile.outputs)
  .filter((file) => file.endsWith(".css"))
  .map((file) => `<link rel="stylesheet" href="${file.slice(outdir.length + 1)}" />`)
  .join("");
await writeFile(
  `${outdir}/index.html`,
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>kiln example</title>
    ${stylesheets}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="main.js"></script>
  </body>
</html>
`,
);
