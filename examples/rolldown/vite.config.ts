import { defineConfig } from "vite-plus";

// Declare the output instead of tracking writes: webpack and Rspack skip writing files whose content is unchanged.
// The bundler may also read what it is about to overwrite, but its output is never an input.
const task = (command: string, outDir: string) => ({
  command,
  cache: { input: [{ auto: true }, "!dist/**", "!dist-extract/**"], output: [`${outDir}/**`] },
});

export default defineConfig({
  run: {
    tasks: {
      build: task("node build.ts", "dist"),
      "build:extract": task("KILN_EXTRACT=1 node build.ts", "dist-extract"),
    },
  },
});
