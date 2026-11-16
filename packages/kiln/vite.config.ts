import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      build: "vp pack",
    },
  },
  pack: {
    entry: ["src/index.ts", "src/core/index.ts", "src/jsx-runtime.ts", "src/jsx-dev-runtime.ts", "src/unplugin/*.ts"],
    format: "esm",
    dts: true,
    fixedExtension: false,
    // Drops in-source tests from the published code.
    define: { "import.meta.vitest": "undefined" },
    external: [/^react/],
  },
});
