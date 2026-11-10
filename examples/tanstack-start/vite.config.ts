import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import kiln from "unplugin-kiln";
import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      build: { command: "vp build", dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }] },
      "build:extract": {
        command: "KILN_EXTRACT=1 vp build",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
      },
    },
  },
  plugins: [
    tanstackStart(),
    // kiln comes after the router so it compiles the modules the router split off, and each imports only its own rules.
    kiln.vite({ extract: process.env.KILN_EXTRACT === "1" }),
    react({ jsxImportSource: "kiln" }),
  ],
});
