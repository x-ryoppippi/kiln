import HtmlWebpackPlugin from "html-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import kiln from "unplugin-kiln/webpack";

/** @type {import("webpack").Configuration} */
export default {
  entry: "./src/main.tsx",
  output: { clean: true },
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
    kiln({ extract: process.env.KILN_EXTRACT === "1" }),
    new HtmlWebpackPlugin({ template: "index.html" }),
    new MiniCssExtractPlugin(),
  ],
};
