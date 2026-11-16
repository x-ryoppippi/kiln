---
title: Extraction and CSS splitting
description: How extract turns compiled rules into static stylesheets, split per chunk or one per entry.
---

# Extraction and CSS splitting

By default the compiler leaves compiled rules in the JavaScript, and they are inserted at runtime through React. With `extract`, they become static CSS instead: the browser can fetch and parse them in parallel with the script, and the JavaScript no longer carries them. Styles that are not literals keep working at runtime either way.

```ts
kiln({ extract: true }); // the same as { split: "chunks" }
kiln({ extract: { split: "chunks" } }); // a stylesheet per entry and lazily loaded chunk
kiln({ extract: { split: "single" } }); // one stylesheet per entry
```

## What each bundler produces

| Bundler                      | `extract` produces                                                   |
| ---------------------------- | -------------------------------------------------------------------- |
| Vite (client build)          | Split stylesheets, linked through Vite's HTML, preloads and manifest |
| Rollup, Rolldown             | Split stylesheets that each chunk loads itself, plus a manifest      |
| Vite dev server              | A CSS module per source module                                       |
| webpack, Rspack, Rsbuild     | A CSS module per source module, for the bundler's CSS pipeline       |
| esbuild, Bun, Farm, unloader | A CSS module per source module                                       |
| Next.js with webpack         | A CSS module per source module                                       |
| Next.js with Turbopack       | Nothing: rules are inserted at runtime                               |

## Splitting by chunk

In a Vite client build, and in Rollup and Rolldown builds, `extract: true` (or `{ split: "chunks" }`) emits a stylesheet for each entry and each lazily loaded chunk that adds rules. Each one holds every rule that chunk needs except those certainly loaded whenever it arrives, in the order they run. A page therefore never misses a rule and never fetches one it is sure to have already.

Two lazily loaded chunks that load together and share a component each still carry its rules, since either may also load alone. Splitting can therefore raise the total size of all stylesheets while lowering what each navigation fetches; [Benchmarks](./benchmarks.md) measures both.

`{ split: "single" }`, or Vite's `build.cssCodeSplit: false`, gives each entry one stylesheet with every rule it can reach instead.

## Vite

- In chunk mode, `build.modulePreload: false` or `experimental.renderBuiltUrl` makes the compiler warn and fall back to one stylesheet per entry.
- These stylesheets do not pass through Vite's CSS pipeline, so PostCSS, `build.cssTarget` and Lightning CSS `targets` do not apply to their rules.
- Vite library mode keeps a CSS module per source module, which Vite bundles into `build.lib.cssFileName`.

## Rollup and Rolldown

The compiler loads the stylesheets itself, so no CSS plugin is needed.

- Each chunk with a stylesheet waits for it with a top-level `await` before its code runs, so a lazily loaded chunk resolves only once its rules are in.
- A dynamic import of a string literal also starts loading the stylesheets of the chunk it imports alongside its JavaScript, so they arrive in parallel. One with a computed specifier, such as a variable, starts fetching them only when the chunk starts to run.
- The few lines that load them are added as chunks render, so chunk cycles from `manualChunks` or Rolldown's groups, Rolldown's `strictExecutionOrder`, an `external` function and `renderChunk` minifiers leave them working.

### The manifest

`.kiln/manifest.json` in the output lists each chunk with, in `css`, the stylesheets that load with it, those of the chunks it imports statically first. Link the entry's `css` files from the page, so they load with its script rather than after it:

```ts
import { writeFile } from "node:fs/promises";

import { MANIFEST, type ManifestChunk } from "kiln/unplugin";
import kiln from "kiln/unplugin/rolldown";
import { build } from "rolldown";

const { output } = await build({ input: "src/main.tsx", output: { dir: "dist" }, plugins: [kiln({ extract: true })] });

const asset = output.find((file) => file.fileName === MANIFEST);
const manifest: Record<string, ManifestChunk> = asset?.type === "asset" ? JSON.parse(String(asset.source)) : {};
const links = (manifest["main.js"]?.css ?? []).map((file) => `<link rel="stylesheet" href="/${file}" />`).join("");

await writeFile(
  "dist/index.html",
  `<!doctype html><html><head>${links}</head><body><div id="root"></div><script type="module" src="/main.js"></script></body></html>`,
);
```

From the `lazy-routes` example, trimmed to one route:

```json
{
  "main.js": {
    "file": "main.js",
    "css": ["assets/kiln-n5-DLwm4.css"],
    "dynamicImports": ["dashboard-BlDgcZMj.js"],
    "isEntry": true
  },
  "dashboard-BlDgcZMj.js": {
    "file": "dashboard-BlDgcZMj.js",
    "css": ["assets/kiln-n5-DLwm4.css", "assets/kiln-B4NQ1rsW.css"],
    "imports": ["main.js", "Chart-B4868fm6.js"],
    "isDynamicEntry": true
  }
}
```

Output that is not an ES module cannot wait for its stylesheets, so it gets one stylesheet per entry, which the page must link from `.kiln/manifest.<format>.json`, such as `.kiln/manifest.cjs.json`; in chunk mode the compiler warns about this.

Outputs of different formats can share a directory, but outputs of one format each need their own. The build fails when one of its outputs would overwrite another's manifest, but it cannot see a separate build that writes to the same directory.

## Limitations

- **Turbopack**: Next.js with Turbopack ignores `extract` and inserts rules at runtime, because Turbopack runs the compiler as a loader, which cannot add CSS modules. Under webpack, Next.js imports a CSS module per source module.
- **Splitting** is planned only by Vite client builds, Rollup and Rolldown. Other bundlers import a CSS module per source module and split or merge them with their own CSS handling.
- **Vite's CSS pipeline** does not process the split stylesheets (see [Vite](#vite)).
- **Symlinked roots**: with webpack, Rspack and Rsbuild, the project root must be a real path (see [Bundler notes](./compiler.md#bundler-notes)).
