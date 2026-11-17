import react from "@vitejs/plugin-react";
import nishiki from "@nishikijs/react/unplugin";
import { defineConfig } from "vite-plus";

import { build, root } from "../shared.ts";

// "runtime" leaves the compiler out, as an app that only sets the JSX import source does; "compiled" adds it without
// extract, and "extract" with it.
const mode = process.env.NISHIKI ?? "runtime";

export default defineConfig({
  // A literal run config lets Vite+ read the tasks without executing this file, which imports @nishikijs/react/unplugin
  // before anything has built it.
  run: {
    tasks: {
      generate: {
        command: "node ../../../scripts/compare/generate.ts nishiki",
        cache: { input: [{ auto: true }, "!apps/**", "!dist-*/**"], output: ["apps/**"] },
      },
      "compare:8": {
        command: "ROUTES=8 vp build --outDir ../../dist-8",
        dependsOn: ["generate", { task: "build", from: ["dependencies"] }],
        cache: { input: [{ auto: true }, "!dist-*/**"], output: ["dist-8/**"] },
      },
      "compare:8:compiled": {
        command: "NISHIKI=compiled ROUTES=8 vp build --outDir ../../dist-8-compiled",
        dependsOn: ["generate", { task: "build", from: ["dependencies"] }],
        cache: { input: [{ auto: true }, "!dist-*/**"], output: ["dist-8-compiled/**"] },
      },
      "compare:8:extract": {
        command: "NISHIKI=extract ROUTES=8 vp build --outDir ../../dist-8-extract",
        dependsOn: ["generate", { task: "build", from: ["dependencies"] }],
        cache: { input: [{ auto: true }, "!dist-*/**"], output: ["dist-8-extract/**"] },
      },
      "compare:8:compact": {
        command: "NISHIKI=compact ROUTES=8 vp build --outDir ../../dist-8-compact",
        dependsOn: ["generate", { task: "build", from: ["dependencies"] }],
        cache: { input: [{ auto: true }, "!dist-*/**"], output: ["dist-8-compact/**"] },
      },
      "compare:32": {
        command: "ROUTES=32 vp build --outDir ../../dist-32",
        dependsOn: ["generate", { task: "build", from: ["dependencies"] }],
        cache: { input: [{ auto: true }, "!dist-*/**"], output: ["dist-32/**"] },
      },
      "compare:32:compiled": {
        command: "NISHIKI=compiled ROUTES=32 vp build --outDir ../../dist-32-compiled",
        dependsOn: ["generate", { task: "build", from: ["dependencies"] }],
        cache: { input: [{ auto: true }, "!dist-*/**"], output: ["dist-32-compiled/**"] },
      },
      "compare:32:extract": {
        command: "NISHIKI=extract ROUTES=32 vp build --outDir ../../dist-32-extract",
        dependsOn: ["generate", { task: "build", from: ["dependencies"] }],
        cache: { input: [{ auto: true }, "!dist-*/**"], output: ["dist-32-extract/**"] },
      },
      "compare:32:compact": {
        command: "NISHIKI=compact ROUTES=32 vp build --outDir ../../dist-32-compact",
        dependsOn: ["generate", { task: "build", from: ["dependencies"] }],
        cache: { input: [{ auto: true }, "!dist-*/**"], output: ["dist-32-compact/**"] },
      },
      "compare:stress": {
        command: "ROUTES=stress vp build --outDir ../../dist-stress",
        dependsOn: ["generate", { task: "build", from: ["dependencies"] }],
        cache: { input: [{ auto: true }, "!dist-*/**"], output: ["dist-stress/**"] },
      },
      "compare:stress:compiled": {
        command: "NISHIKI=compiled ROUTES=stress vp build --outDir ../../dist-stress-compiled",
        dependsOn: ["generate", { task: "build", from: ["dependencies"] }],
        cache: { input: [{ auto: true }, "!dist-*/**"], output: ["dist-stress-compiled/**"] },
      },
      "compare:stress:extract": {
        command: "NISHIKI=extract ROUTES=stress vp build --outDir ../../dist-stress-extract",
        dependsOn: ["generate", { task: "build", from: ["dependencies"] }],
        cache: { input: [{ auto: true }, "!dist-*/**"], output: ["dist-stress-extract/**"] },
      },
      "compare:stress:compact": {
        command: "NISHIKI=compact ROUTES=stress vp build --outDir ../../dist-stress-compact",
        dependsOn: ["generate", { task: "build", from: ["dependencies"] }],
        cache: { input: [{ auto: true }, "!dist-*/**"], output: ["dist-stress-compact/**"] },
      },
    },
  },
  root,
  build,
  plugins: [
    mode === "runtime"
      ? []
      : nishiki.vite({ extract: mode === "compact" ? { classNames: "compact" } : mode === "extract" }),
    react({ jsxImportSource: "@nishikijs/react" }),
  ],
});
