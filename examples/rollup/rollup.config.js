import { rm } from "node:fs/promises";
import commonjs from "@rollup/plugin-commonjs";
import html from "@rollup/plugin-html";
import resolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import esbuild from "rollup-plugin-esbuild";
import { MANIFEST } from "unplugin-kiln";
import kiln from "unplugin-kiln/rollup";

const extract = process.env.KILN_EXTRACT === "1";

// Rollup has no option to empty the output directory before writing.
/** @returns {import("rollup").Plugin} */
function cleanDir() {
  return {
    name: "clean-dir",
    async renderStart({ dir }) {
      if (dir) await rm(dir, { recursive: true, force: true });
    },
  };
}

// kiln's manifest lists the stylesheets each chunk loads; linking the entry's lets them load in parallel with its script.
/** @param {import("rollup").OutputBundle} bundle */
function stylesheets(bundle, entry) {
  const manifest = bundle[MANIFEST];
  if (manifest?.type !== "asset") return "";
  /** @type {Record<string, import("unplugin-kiln").ManifestChunk>} */
  const chunks = JSON.parse(String(manifest.source));
  return (chunks[entry]?.css ?? []).map((file) => `<link rel="stylesheet" href="${file}" />`).join("");
}

/** @type {import("rollup").RollupOptions} */
export default {
  input: "src/main.tsx",
  output: { dir: extract ? "dist-extract" : "dist", format: "es", entryFileNames: "main.js" },
  plugins: [
    cleanDir(),
    kiln({ extract }),
    resolve({ browser: true, extensions: [".tsx", ".ts", ".mjs", ".js", ".json"] }),
    commonjs(),
    replace({ preventAssignment: true, values: { "process.env.NODE_ENV": JSON.stringify("production") } }),
    esbuild({ jsx: "automatic", jsxImportSource: "kiln", minify: true }),
    html({
      template: ({ bundle, files }) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>kiln example</title>
    ${stylesheets(bundle, "main.js")}
  </head>
  <body>
    <div id="root"></div>
    ${(files.js ?? []).map(({ fileName }) => `<script type="module" src="${fileName}"></script>`).join("")}
  </body>
</html>
`,
    }),
  ],
};
