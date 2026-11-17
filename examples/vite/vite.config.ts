import react from "@vitejs/plugin-react";
import nishiki from "@nishikijs/react/unplugin";
import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      build: { command: "vp build", dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }] },
      "build:extract": {
        command: "NISHIKI_EXTRACT=1 vp build --outDir dist-extract",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
      },
    },
  },
  plugins: [
    nishiki.vite({ extract: process.env.NISHIKI_EXTRACT === "1" }),
    react({ jsxImportSource: "@nishikijs/react" }),
  ],
});
