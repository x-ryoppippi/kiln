import { defaultTheme, defineTheme, oxContent } from "@ox-content/vite-plugin";
import react from "@vitejs/plugin-react";
import kiln from "kiln/unplugin";
import { defineConfig } from "vite-plus";

import { base, description, name, repository } from "./site.ts";

export default defineConfig({
  run: {
    tasks: {
      build: { command: "vp build", dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }] },
    },
  },
  base,
  plugins: [
    // The live examples are styled with kiln itself, compiled and extracted to static CSS like any user's build.
    kiln.vite({ extract: { split: "single" } }),
    react({ jsxImportSource: "kiln" }),
    oxContent({
      srcDir: "content",
      outDir: "dist",
      base,
      highlight: true,
      codeGroups: true,
      codeImports: true,
      containers: true,
      // Embeds fetch from the network at build time, and API docs are written into the sources; both would defeat the task cache.
      embeds: false,
      docs: false,
      ssg: {
        siteName: name,
        theme: defineTheme({
          extends: defaultTheme,
          nav: [
            { text: "Guide", link: `${base}getting-started/` },
            { text: "Compiler", link: `${base}compiler/` },
          ],
          socialLinks: { github: repository },
          sidebar: [
            {
              text: "Guide",
              items: [
                { text: "Getting started", link: "/getting-started.md" },
                { text: "Styling API", link: "/styling.md" },
                { text: "How it works", link: "/how-it-works.md" },
                { text: "Migrating from restyle", link: "/migrating-from-restyle.md" },
              ],
            },
            {
              text: "Compiler",
              items: [
                { text: "Bundler setup", link: "/compiler.md" },
                { text: "Extraction and CSS splitting", link: "/extraction.md" },
                { text: "Benchmarks", link: "/benchmarks.md" },
              ],
            },
          ],
          footer: { message: `${description} Released under the MIT Licence.` },
          // The theme's reset and prose margins are unlayered, so they beat kiln's layered rules; inside the live
          // examples, revert them to whatever the layers below say.
          css: `.content .ox-island * { margin: revert-layer; padding: revert-layer; } .header-nav { margin-left: 1.5rem; }`,
          embed: {
            head: `<link rel="stylesheet" href="${base}assets/islands.css"><script type="module" src="${base}assets/islands.js"></script>`,
          },
        }),
      },
    }),
  ],
  build: {
    outDir: "dist",
    rolldownOptions: {
      // ox-content renders the pages; Vite only bundles the script that mounts the live examples.
      input: { islands: "src/islands.tsx" },
      // The theme's <head> is fixed at config time, so it links the bundle by a stable name.
      output: { entryFileNames: "assets/[name].js", assetFileNames: "assets/islands[extname]" },
    },
  },
});
