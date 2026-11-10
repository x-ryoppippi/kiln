import react from "@vitejs/plugin-react";
import kiln from "unplugin-kiln";
import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      build: "vp build",
      "build:extract": "KILN_EXTRACT=1 vp build --outDir dist-extract",
    },
  },
  plugins: [kiln.vite({ extract: process.env.KILN_EXTRACT === "1" }), react({ jsxImportSource: "kiln" })],
});
