// What every compared app's build shares. `ROUTES` picks the app size the generate task wrote; scripts/bench-compare.ts
// walks the manifest for load paths, and attributes bytes to packages through the hidden source maps, which leave the
// emitted code as it would be without them.
export const root: string = `apps/${process.env.ROUTES ?? "8"}`;
export const build = { manifest: true, sourcemap: "hidden", emptyOutDir: true } as const;
