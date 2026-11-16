import { tanstackRouter } from "@tanstack/router-plugin/vite";
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
  // The manifest records which CSS each chunk loads, from which the benchmark's `--routes` columns are computed.
  build: { manifest: true },
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    // nishiki comes after the router so it compiles the modules the router split off, and each imports only its own rules.
    nishiki.vite({ extract: process.env.NISHIKI_EXTRACT === "1" }),
    react({ jsxImportSource: "@nishikijs/react" }),
  ],
});
