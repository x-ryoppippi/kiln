import type { ManifestChunk, Options } from "unplugin-kiln";

// The page for the Rollup and Rolldown builds, which have no HTML entry. It links the stylesheets kiln's manifest
// lists for the entry, so they load in parallel with its script instead of after it.
export function page(manifest: Record<string, ManifestChunk>, entry: string): string {
  const links = (manifest[entry]?.css ?? []).map((file) => `<link rel="stylesheet" href="/${file}" />`).join("");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>kiln example</title>
    ${links}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${entry}"></script>
  </body>
</html>
`;
}

// Where each build writes, by its kiln options: dist-<bundler>, then -extract and -single.
export const outDir = (bundler: string): string =>
  ["dist", bundler, process.env.KILN_EXTRACT === "1" && "extract", process.env.SINGLE_CSS === "1" && "single"]
    .filter(Boolean)
    .join("-");

export const extract: Options["extract"] = process.env.KILN_EXTRACT === "1" && {
  split: process.env.SINGLE_CSS === "1" ? "single" : "chunks",
};
