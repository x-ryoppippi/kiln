import path from "node:path";

import HtmlWebpackPlugin from "html-webpack-plugin";
import kiln from "kiln/unplugin/webpack";
import MiniCssExtractPlugin from "mini-css-extract-plugin";

import { chunkManifest, template } from "./chunks.ts";
import { extract, outDir } from "./page.ts";

/** @type {import("webpack").Configuration} */
export default {
  mode: "production",
  entry: "./src/main.tsx",
  output: {
    path: path.resolve(outDir("webpack")),
    filename: "[name].[contenthash:8].js",
    clean: true,
  },
  resolve: { extensions: [".tsx", ".ts", ".js"] },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: "swc-loader",
          options: {
            jsc: {
              parser: { syntax: "typescript", tsx: true },
              transform: { react: { runtime: "automatic", importSource: "kiln" } },
            },
          },
        },
      },
      { test: /\.css$/, use: [MiniCssExtractPlugin.loader, "css-loader"] },
    ],
  },
  plugins: [
    kiln({ extract }),
    new HtmlWebpackPlugin({ templateContent: template }),
    new MiniCssExtractPlugin({ filename: "[name].[contenthash:8].css" }),
    chunkManifest(),
  ],
};
