// Where the webpack, Rspack and Rsbuild builds record their chunk graph for the benchmark's `--routes` walk.
export const CHUNKS = ".chunks/manifest.json";

// The chunk graph of a webpack or Rspack build in the shape of Vite's manifest, as the benchmark reads it. The runtime
// loads a chunk group's chunks together, so each group is an entry that imports its chunks, and each chunk imports
// dynamically the groups its code imports. Recorded once the files have their final names.
export function chunkManifest(): { apply(compiler: any): void } {
  return {
    apply(compiler) {
      compiler.hooks.thisCompilation.tap("chunk-manifest", (compilation: any) => {
        compilation.hooks.processAssets.tap(
          { name: "chunk-manifest", stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT },
          () => {
            const { chunkGraph } = compilation;
            // Rspack hands out a new object for a chunk or a group on every access, so they are keyed by chunk id.
            const chunkKey = (chunk: any) => `chunk:${chunk.id}`;
            const groupKey = (group: any) => `group:${group.chunks.map((chunk: any) => chunk.id).sort()}`;
            const files = (chunk: any): string[] => [...chunk.files];
            const script = (chunks: any[]) =>
              chunks.flatMap(files).find((file) => file.endsWith(".js")) ?? files(chunks[0]!)[0];
            const flatten = (modules: Iterable<any>): any[] =>
              [...modules].flatMap((module) => (module.modules ? flatten(module.modules) : [module]));
            const manifest: Record<string, object> = {};
            for (const chunk of compilation.chunks) {
              const dynamicImports = new Set<string>();
              const visit = (block: any) => {
                const group = chunkGraph.getBlockChunkGroup(block);
                if (group) dynamicImports.add(groupKey(group));
                for (const inner of block.blocks ?? []) visit(inner);
              };
              for (const module of flatten(chunkGraph.getChunkModulesIterable(chunk))) {
                for (const block of module.blocks ?? []) visit(block);
              }
              manifest[chunkKey(chunk)] = {
                file: script([chunk]),
                css: files(chunk).filter((file) => file.endsWith(".css")),
                dynamicImports: [...dynamicImports],
              };
            }
            for (const group of compilation.chunkGroups) {
              manifest[groupKey(group)] = {
                file: script(group.chunks),
                imports: group.chunks.map(chunkKey),
                ...(group.isInitial() && { isEntry: true }),
              };
            }
            const { RawSource } = compiler.webpack.sources;
            compilation.emitAsset(CHUNKS, new RawSource(JSON.stringify(manifest, null, 2) + "\n"));
          },
        );
      });
    },
  };
}

// The page for the webpack, Rspack and Rsbuild builds, whose HTML plugins add the entry's scripts and stylesheets.
export const template = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>nishiki example</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;
