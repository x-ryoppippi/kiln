import {
  defaultTheme,
  defineTheme,
  oxContent,
  type MarkdownNode,
  type MarkdownTransformer,
} from "@ox-content/vite-plugin";
import react from "@vitejs/plugin-react";
import kiln from "kiln/unplugin";
import { defineConfig } from "vite-plus";

import manifest from "./package.json" with { type: "json" };
import { base, description, name, repository } from "./site.ts";

// The workspace package the pages, and the live examples' imported source, are written against.
const source = Object.entries(manifest.dependencies).find(([, version]) => version.startsWith("workspace:"))?.[0];
if (!source) throw new Error("docs/package.json has no workspace dependency to take the library's name from");
const sourceName = new RegExp(`\\b${source}\\b`, "g");

// Shows `name` wherever the pages name the package: in prose, inline code and code blocks. Link targets keep pointing
// at real paths, and MDX element names are components, not text.
const showName: MarkdownTransformer = {
  name: "show-name",
  transform(node) {
    const rename = (node: MarkdownNode): void => {
      for (const key of ["value", "meta", "alt", "title"] as const) {
        const text = node[key];
        if (typeof text === "string") node[key] = text.replace(sourceName, name);
      }
      node.children?.forEach(rename);
    };
    rename(node);
    return node;
  },
};

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
const buildHead = `<link rel="stylesheet" href="${base}assets/islands.css"><script type="module" src="${base}assets/islands.js"></script>`;

export default defineConfig(({ command }) => ({
  run: {
    tasks: {
      build: { command: "vp build", dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }] },
    },
  },
  base,
  plugins: [
    // The live examples are styled with kiln itself, compiled and extracted to static CSS like any user's build.
    kiln.vite({ extract: { split: "single" } }),
    react({ jsxImportSource: source }),
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
      transformers: [showName],
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
