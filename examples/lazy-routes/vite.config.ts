import react from "@vitejs/plugin-react";
import nishiki from "@nishikijs/react/unplugin";
import { defineConfig } from "vite-plus";

export default defineConfig({
  // A literal run config lets Vite+ read the tasks without executing this file, which imports @nishikijs/react/unplugin before
  // anything has built it. Each task writes its own directory, which the others must not read as input.
  run: {
    tasks: {
      build: {
        command: "vp build --outDir dist",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist/**"] },
      },
      "build:extract": {
        command: "NISHIKI_EXTRACT=1 vp build --outDir dist-extract",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-extract/**"] },
      },
      "build:extract:single": {
        command: "NISHIKI_EXTRACT=1 SINGLE_CSS=1 vp build --outDir dist-extract-single",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-extract-single/**"] },
      },
      "build:rollup": {
        command: "rollup --config",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-rollup/**"] },
      },
      "build:rollup:extract": {
        command: "NISHIKI_EXTRACT=1 rollup --config",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-rollup-extract/**"] },
      },
      "build:rollup:extract:single": {
        command: "NISHIKI_EXTRACT=1 SINGLE_CSS=1 rollup --config",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-rollup-extract-single/**"] },
      },
      "build:rolldown": {
        command: "node rolldown.ts",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-rolldown/**"] },
      },
      "build:rolldown:extract": {
        command: "NISHIKI_EXTRACT=1 node rolldown.ts",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-rolldown-extract/**"] },
      },
      "build:rolldown:extract:single": {
        command: "NISHIKI_EXTRACT=1 SINGLE_CSS=1 node rolldown.ts",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-rolldown-extract-single/**"] },
      },
      "build:webpack": {
        command: "webpack --config webpack.config.js",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-webpack/**"] },
      },
      "build:webpack:extract": {
        command: "NISHIKI_EXTRACT=1 webpack --config webpack.config.js",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-webpack-extract/**"] },
      },
      "build:webpack:extract:single": {
        command: "NISHIKI_EXTRACT=1 SINGLE_CSS=1 webpack --config webpack.config.js",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-webpack-extract-single/**"] },
      },
      "build:rspack": {
        command: "rspack build --config rspack.config.js",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-rspack/**"] },
      },
      "build:rspack:extract": {
        command: "NISHIKI_EXTRACT=1 rspack build --config rspack.config.js",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-rspack-extract/**"] },
      },
      "build:rspack:extract:single": {
        command: "NISHIKI_EXTRACT=1 SINGLE_CSS=1 rspack build --config rspack.config.js",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-rspack-extract-single/**"] },
      },
      "build:rsbuild": {
        command: "rsbuild build",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-rsbuild/**"] },
      },
      "build:rsbuild:extract": {
        command: "NISHIKI_EXTRACT=1 rsbuild build",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-rsbuild-extract/**"] },
      },
      "build:rsbuild:extract:single": {
        command: "NISHIKI_EXTRACT=1 SINGLE_CSS=1 rsbuild build",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
        cache: { input: [{ auto: true }, "!dist/**", "!dist-*/**"], output: ["dist-rsbuild-extract-single/**"] },
      },
    },
  },
  // The manifest records which CSS each chunk loads, from which the benchmark's `--routes` columns are computed.
  build: { manifest: true },
  plugins: [
    nishiki.vite({
      extract: process.env.NISHIKI_EXTRACT === "1" && { split: process.env.SINGLE_CSS === "1" ? "single" : "chunks" },
    }),
    react({ jsxImportSource: "@nishikijs/react" }),
  ],
});
