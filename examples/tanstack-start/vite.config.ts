import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import kiln from "unplugin-kiln";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [
    // kiln goes first so it compiles each route file whole, before the router splits it into chunks.
    kiln.vite({ extract: process.env.KILN_EXTRACT === "1" }),
    tanstackStart(),
    react({ jsxImportSource: "kiln" }),
  ],
});
