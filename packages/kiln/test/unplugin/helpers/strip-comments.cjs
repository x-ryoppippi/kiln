// A CSS loader that drops every comment, as a minifier can.
module.exports = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
