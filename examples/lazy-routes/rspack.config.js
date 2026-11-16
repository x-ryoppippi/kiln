import path from "node:path";

import { rspack } from "@rspack/core";
import nishiki from "@nishikijs/react/unplugin/rspack";

import { chunkManifest, template } from "./chunks.ts";
import { extract, outDir } from "./page.ts";

/** @type {import("@rspack/core").Configuration} */
export default {
  mode: "production",
  entry: "./src/main.tsx",
  output: {
    path: path.resolve(outDir("rspack")),
    filename: "[name].[contenthash:8].js",
    clean: true,
  },
  resolve: { extensions: [".tsx", ".ts", ".js"] },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        loader: "builtin:swc-loader",
        options: {
          jsc: {
            parser: { syntax: "typescript", tsx: true },
            transform: { react: { runtime: "automatic", importSource: "@nishikijs/react" } },
          },
        },
      },
      { test: /\.css$/, use: [rspack.CssExtractRspackPlugin.loader, "css-loader"] },
    ],
  },
  plugins: [
    nishiki({ extract }),
    new rspack.HtmlRspackPlugin({ templateContent: template }),
    new rspack.CssExtractRspackPlugin({ filename: "[name].[contenthash:8].css" }),
    chunkManifest(),
  ],
};
