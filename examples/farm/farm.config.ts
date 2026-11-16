import { defineConfig } from "@farmfe/core";
import nishiki from "@nishikijs/react/unplugin/farm";

export default defineConfig({
  compilation: {
    input: { index: "./index.html" },
    // Farm's default browser target injects core-js polyfills, which this app does not depend on.
    output: { targetEnv: "browser-esnext" },
  },
  // Farm only strips types from TSX; the JSX transform comes from its React plugin.
  plugins: [
    ["@farmfe/plugin-react", { runtime: "automatic", importSource: "@nishikijs/react" }],
    nishiki({ extract: process.env.NISHIKI_EXTRACT === "1" }),
  ],
});
