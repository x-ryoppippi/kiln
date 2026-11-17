import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import nishiki from "@nishikijs/react/unplugin/rsbuild";

export default defineConfig({
  plugins: [
    pluginReact({ swcReactOptions: { importSource: "@nishikijs/react" } }),
    nishiki({ extract: process.env.NISHIKI_EXTRACT === "1" }),
  ],
  source: { entry: { index: "./src/main.tsx" } },
  html: { title: "nishiki example" },
});
