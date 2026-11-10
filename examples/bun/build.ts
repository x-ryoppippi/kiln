import path from "node:path";

import kiln from "unplugin-kiln/bun";

const extract = process.env.KILN_EXTRACT === "1";
const outdir = extract ? "dist-extract" : "dist";

const result = await Bun.build({
  entrypoints: ["src/main.tsx"],
  outdir,
  minify: true,
  naming: "[name].[ext]",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [kiln({ extract })],
});
if (!result.success) throw new AggregateError(result.logs, "Bun.build failed");

const stylesheets = result.outputs
  .filter((output) => output.path.endsWith(".css"))
  .map((output) => `<link rel="stylesheet" href="${path.basename(output.path)}" />`)
  .join("");
await Bun.write(
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
