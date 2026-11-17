// Compiles JSX after nishiki's pre-loader, as a webpack app's own JSX loader would.
const { transformSync } = require("esbuild");

module.exports = function jsxLoader(code) {
  return transformSync(code, { loader: "jsx", jsx: "automatic", jsxImportSource: "@nishikijs/react" }).code;
};
