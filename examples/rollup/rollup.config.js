import { rm } from "node:fs/promises";
import commonjs from "@rollup/plugin-commonjs";
import html from "@rollup/plugin-html";
import resolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import esbuild from "rollup-plugin-esbuild";
import kiln from "unplugin-kiln/rollup";

const extract = process.env.KILN_EXTRACT === "1";

// Rollup does not bundle CSS, so collect every imported stylesheet into one asset.
/** @returns {import("rollup").Plugin} */
function cssBundle(fileName) {
  const sheets = new Map();
  return {
    name: "css-bundle",
    transform(code, id) {
      if (!id.endsWith(".css")) return;
      sheets.set(id, code);
      return { code: "", map: null };
    },
    generateBundle() {
      if (sheets.size > 0) this.emitFile({ type: "asset", fileName, source: [...sheets.values()].join("\n") });
    },
  };
}

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
    cssBundle("main.css"),
    html({
      template: ({ files }) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>kiln example</title>
    ${(files.css ?? []).map(({ fileName }) => `<link rel="stylesheet" href="${fileName}" />`).join("")}
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
