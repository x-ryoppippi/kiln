import react from "@vitejs/plugin-react";
import kiln from "kiln/unplugin";
import { defineConfig } from "vite-plus";

export default defineConfig({
  // A literal run config lets Vite+ read the tasks without executing this file, which imports kiln/unplugin before
  // anything has built it. Each task writes its own directory, which the others must not read as input. The
  // sources are generated rather than committed, unlike lazy-routes', since they run to thousands of lines.
  run: {
    tasks: {
      generate: {
        command: "node ../../scripts/gen-lazy-routes.ts --routes 128 --out src",
        cache: { input: [{ auto: true }, "!src/**", "!dist/**", "!dist-*/**"], output: ["src/**"] },
      },
      build: {
        command: "vp build --outDir dist",
        dependsOn: ["generate", { task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist/**"] },
      },
      "build:extract": {
        command: "KILN_EXTRACT=1 vp build --outDir dist-extract",
        dependsOn: ["generate", { task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-extract/**"] },
      },
      "build:extract:single": {
        command: "KILN_EXTRACT=1 SINGLE_CSS=1 vp build --outDir dist-extract-single",
        dependsOn: ["generate", { task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-extract-single/**"] },
      },
      "build:rollup": {
        command: "rollup --config",
        dependsOn: ["generate", { task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-rollup/**"] },
      },
      "build:rollup:extract": {
        command: "KILN_EXTRACT=1 rollup --config",
        dependsOn: ["generate", { task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-rollup-extract/**"] },
      },
      "build:rollup:extract:single": {
        command: "KILN_EXTRACT=1 SINGLE_CSS=1 rollup --config",
        dependsOn: ["generate", { task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-rollup-extract-single/**"] },
      },
      "build:rolldown": {
        command: "node rolldown.ts",
        dependsOn: ["generate", { task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-rolldown/**"] },
      },
      "build:rolldown:extract": {
        command: "KILN_EXTRACT=1 node rolldown.ts",
        dependsOn: ["generate", { task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-rolldown-extract/**"] },
      },
      "build:rolldown:extract:single": {
        command: "KILN_EXTRACT=1 SINGLE_CSS=1 node rolldown.ts",
        dependsOn: ["generate", { task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-rolldown-extract-single/**"] },
      },
    },
  },
  // The manifest records which CSS each chunk loads, from which the benchmark's `--routes` columns are computed.
  build: { manifest: true },
  plugins: [
    kiln.vite({
      extract: process.env.KILN_EXTRACT === "1" && { split: process.env.SINGLE_CSS === "1" ? "single" : "chunks" },
    }),
    react({ jsxImportSource: "kiln" }),
  ],
});
