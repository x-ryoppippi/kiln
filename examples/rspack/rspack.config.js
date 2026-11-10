import { rspack } from "@rspack/core";
import kiln from "unplugin-kiln/rspack";

/** @type {import("@rspack/core").Configuration} */
export default {
  entry: "./src/main.tsx",
  output: { clean: true },
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
            transform: { react: { runtime: "automatic", importSource: "kiln" } },
          },
        },
      },
      { test: /\.css$/, use: [rspack.CssExtractRspackPlugin.loader, "css-loader"] },
    ],
  },
  plugins: [
    kiln({ extract: process.env.KILN_EXTRACT === "1" }),
    new rspack.HtmlRspackPlugin({ template: "index.html" }),
    new rspack.CssExtractRspackPlugin(),
  ],
};
