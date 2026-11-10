import { writeFile } from "node:fs/promises";

import { build, type Plugin } from "rolldown";
import kiln from "unplugin-kiln/rolldown";

const extract = process.env.KILN_EXTRACT === "1";
const dir = extract ? "dist-extract" : "dist";

// Rolldown does not bundle CSS, so collect every imported stylesheet into one asset.
function cssBundle(fileName: string): Plugin {
  const sheets = new Map<string, string>();
  return {
    name: "css-bundle",
    transform: {
      filter: { id: /\.css$/ },
      handler(code, id) {
        sheets.set(id, code);
        return { code: "", moduleType: "js" };
      },
    },
    generateBundle() {
      if (sheets.size > 0) this.emitFile({ type: "asset", fileName, source: [...sheets.values()].join("\n") });
    },
  };
}

const { output } = await build({
  input: "src/main.tsx",
  output: { dir, minify: true, entryFileNames: "main.js", cleanDir: true },
  // JSX settings, including kiln as the import source, come from tsconfig.json.
  transform: { define: { "process.env.NODE_ENV": '"production"' } },
  plugins: [kiln({ extract }), cssBundle("main.css")],
});

const stylesheets = output
  .filter((file) => file.fileName.endsWith(".css"))
  .map((file) => `<link rel="stylesheet" href="${file.fileName}" />`)
  .join("");
await writeFile(
  `${dir}/index.html`,
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
