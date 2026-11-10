import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      build: "vp pack",
    },
  },
  pack: {
    entry: ["src/*.ts"],
    format: "esm",
    dts: true,
    fixedExtension: false,
  },
});
