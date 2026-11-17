// Checked by feature rather than version, since Bun and Deno report a Node.js version of their own choosing. This is its
// own module, imported first, because the modules imported after it use `RegExp.escape` as they load.
if (typeof RegExp.escape !== "function") {
  const node = process.release?.name === "node" ? ` (this is Node.js ${process.versions.node})` : "";
  throw new Error(`[nishiki] This runtime lacks RegExp.escape; the compiler requires Node.js 24 or later${node}.`);
}
