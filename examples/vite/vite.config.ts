import react from "@vitejs/plugin-react";
import kiln from "unplugin-kiln";
import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      build: { command: "vp build", dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }] },
      "build:extract": {
        command: "KILN_EXTRACT=1 vp build --outDir dist-extract",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
      },
    },
  },
  plugins: [kiln.vite({ extract: process.env.KILN_EXTRACT === "1" }), react({ jsxImportSource: "kiln" })],
});
