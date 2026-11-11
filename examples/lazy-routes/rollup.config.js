import { rm } from "node:fs/promises";
import commonjs from "@rollup/plugin-commonjs";
import html from "@rollup/plugin-html";
import resolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import esbuild from "rollup-plugin-esbuild";
import { MANIFEST } from "unplugin-kiln";
import kiln from "unplugin-kiln/rollup";

import { extract, outDir, page } from "./page.ts";

/** @type {import("rollup").RollupOptions} */
export default {
  input: "src/main.tsx",
  output: { dir: outDir("rollup"), format: "es", entryFileNames: "main.js" },
  plugins: [
    {
      name: "clean-dir",
      async renderStart({ dir }) {
        if (dir) await rm(dir, { recursive: true, force: true });
      },
    },
    kiln({ extract }),
    resolve({ browser: true, extensions: [".tsx", ".ts", ".mjs", ".js", ".json"] }),
    commonjs(),
    replace({ preventAssignment: true, values: { "process.env.NODE_ENV": JSON.stringify("production") } }),
    esbuild({ jsx: "automatic", jsxImportSource: "kiln", minify: true }),
    html({
      template: ({ bundle }) => {
        const manifest = bundle[MANIFEST];
        return page(manifest?.type === "asset" ? JSON.parse(String(manifest.source)) : {}, "main.js");
      },
    }),
  ],
};
