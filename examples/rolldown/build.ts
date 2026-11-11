import { writeFile } from "node:fs/promises";

import { build } from "rolldown";
import { MANIFEST, type ManifestChunk } from "unplugin-kiln";
import kiln from "unplugin-kiln/rolldown";

const extract = process.env.KILN_EXTRACT === "1";
const dir = extract ? "dist-extract" : "dist";

const { output } = await build({
  input: "src/main.tsx",
  output: { dir, minify: true, entryFileNames: "main.js", cleanDir: true },
  // JSX settings, including kiln as the import source, come from tsconfig.json.
  transform: { define: { "process.env.NODE_ENV": '"production"' } },
  plugins: [kiln({ extract })],
});

// kiln's manifest lists the stylesheets each chunk loads; linking the entry's lets them load in parallel with its script.
const manifest = output.find((file) => file.fileName === MANIFEST);
const chunks: Record<string, ManifestChunk> = manifest?.type === "asset" ? JSON.parse(String(manifest.source)) : {};
const stylesheets = (chunks["main.js"]?.css ?? []).map((file) => `<link rel="stylesheet" href="${file}" />`).join("");
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
