import react from "@vitejs/plugin-react";
import kiln from "unplugin-kiln";
import { defineConfig } from "vite-plus";

export default defineConfig({
  // A literal run config lets Vite+ read the tasks without executing this file, which imports unplugin-kiln before
  // anything has built it. Each task writes its own directory, which the others must not read as input.
  run: {
    tasks: {
      build: {
        command: "vp build --outDir dist",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist/**"] },
      },
      "build:extract": {
        command: "KILN_EXTRACT=1 vp build --outDir dist-extract",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-extract/**"] },
      },
      "build:extract:single": {
        command: "KILN_EXTRACT=1 SINGLE_CSS=1 vp build --outDir dist-extract-single",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-extract-single/**"] },
      },
    },
  },
  // The manifest records which CSS each chunk loads, from which the benchmark's `--routes` columns are computed.
  build: { manifest: true, cssCodeSplit: process.env.SINGLE_CSS !== "1" },
  plugins: [kiln.vite({ extract: process.env.KILN_EXTRACT === "1" }), react({ jsxImportSource: "kiln" })],
});
