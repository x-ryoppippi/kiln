import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

import { build, root } from "../shared.ts";

export default defineConfig({
  run: {
    tasks: {
      generate: {
        command: "node ../../../scripts/compare/generate.ts panda",
        cache: { input: [{ auto: true }, "!apps/**", "!dist-*/**"], output: ["apps/**"] },
      },
      codegen: {
        command: "panda codegen",
        cache: { input: [{ auto: true }, "!apps/**", "!dist-*/**", "!styled-system/**"], output: ["styled-system/**"] },
      },
      "compare:8": {
        command: "ROUTES=8 vp build --outDir ../../dist-8",
        dependsOn: ["generate", "codegen"],
        cache: { input: [{ auto: true }, "!dist-*/**"], output: ["dist-8/**"] },
      },
      "compare:32": {
        command: "ROUTES=32 vp build --outDir ../../dist-32",
        dependsOn: ["generate", "codegen"],
        cache: { input: [{ auto: true }, "!dist-*/**"], output: ["dist-32/**"] },
      },
      "compare:stress": {
        command: "ROUTES=stress vp build --outDir ../../dist-stress",
        dependsOn: ["generate", "codegen"],
        cache: { input: [{ auto: true }, "!dist-*/**"], output: ["dist-stress/**"] },
      },
    },
  },
  root,
  build,
  resolve: { alias: { "styled-system": path.join(import.meta.dirname, "styled-system") } },
  plugins: [react()],
});
