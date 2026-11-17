import { defaultTheme, defineTheme, oxContent } from "@ox-content/vite-plugin";
import react from "@vitejs/plugin-react";
import { layerOrder } from "@nishikijs/react/core";
import nishiki from "@nishikijs/react/unplugin";
import { defineConfig } from "vite-plus";

import { base, description, name, repository } from "./site.ts";

// ox-content serves pages without Vite's HTML transform, so the dev head loads the island source itself, after the
// React Refresh preamble that @vitejs/plugin-react would otherwise inject; in dev the compiler imports a CSS module per
// source module, so there is no stylesheet to link.
const devHead = `<script type="module">
import RefreshRuntime from "${base}@react-refresh";
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
</script><script type="module" src="${base}@vite/client"></script><script type="module" src="${base}src/islands.tsx"></script>`;
// The theme links the extracted sheet ahead of anything React renders, so the full layer order has to come first for
// rules the islands leave to runtime to rank among the extracted ones.
const buildHead = `<style>${layerOrder()}</style><link rel="stylesheet" href="${base}assets/islands.css"><script type="module" src="${base}assets/islands.js"></script>`;

export default defineConfig(({ command }) => ({
  run: {
    tasks: {
      build: { command: "vp build", dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }] },
    },
  },
  base,
  plugins: [
    // The live examples are styled with nishiki itself, compiled and extracted to static CSS like any user's build.
    nishiki.vite({ extract: { split: "single" } }),
    react({ jsxImportSource: "@nishikijs/react" }),
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
        notFound: true,
        theme: defineTheme({
          extends: defaultTheme,
          nav: [
            { text: "Why nishiki", link: `${base}why/` },
            { text: "Guide", link: `${base}getting-started/` },
            { text: "Compiler", link: `${base}compiler/` },
            { text: "Sponsors", link: `${base}sponsors/` },
          ],
          socialLinks: { github: repository },
          sidebar: [
            {
              text: "Background",
              items: [
                { text: "Why nishiki", link: "/why.md" },
                { text: "Technical background", link: "/technical-background.md" },
                { text: "Comparison", link: "/comparison.md" },
              ],
            },
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
                { text: "Against other libraries", link: "/library-benchmarks.md" },
              ],
            },
            {
              text: "Project",
              items: [{ text: "Sponsors", link: "/sponsors.md" }],
            },
          ],
          footer: { message: `${description} Released under the MIT Licence.` },
          // The theme's reset and prose margins are unlayered, so they beat nishiki's layered rules; inside the live
          // examples, revert them to whatever the layers below say.
          css: `.content .ox-island * { margin: revert-layer; padding: revert-layer; } .header-nav { margin-left: 1.5rem; }`,
          embed: { head: command === "serve" ? devHead : buildHead },
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
}));
