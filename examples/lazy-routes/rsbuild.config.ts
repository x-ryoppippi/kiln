import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import nishiki from "@nishikijs/react/unplugin/rsbuild";

import { chunkManifest } from "./chunks.ts";
import { extract, outDir } from "./page.ts";

export default defineConfig({
  plugins: [pluginReact({ swcReactOptions: { importSource: "@nishikijs/react" } }), nishiki({ extract })],
  source: { entry: { index: "./src/main.tsx" } },
  output: { distPath: { root: outDir("rsbuild") }, cleanDistPath: true },
  html: { title: "nishiki example" },
  tools: { rspack: { plugins: [chunkManifest()] } },
});
