import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import kiln from "unplugin-kiln/rsbuild";

export default defineConfig({
  plugins: [
    pluginReact({ swcReactOptions: { importSource: "kiln" } }),
    kiln({ extract: process.env.KILN_EXTRACT === "1" }),
  ],
  source: { entry: { index: "./src/main.tsx" } },
  html: { title: "kiln example" },
});
