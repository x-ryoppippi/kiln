import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import kiln from "kiln/unplugin/rsbuild";

import { chunkManifest } from "./chunks.ts";
import { extract, outDir } from "./page.ts";

export default defineConfig({
  plugins: [pluginReact({ swcReactOptions: { importSource: "kiln" } }), kiln({ extract })],
  source: { entry: { index: "./src/main.tsx" } },
  output: { distPath: { root: outDir("rsbuild") }, cleanDistPath: true },
  html: { title: "kiln example" },
  tools: { rspack: { plugins: [chunkManifest()] } },
});
