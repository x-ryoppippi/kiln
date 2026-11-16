// The name the site shows for the library. The pages and examples are written against the package the docs build
// with, and vite.config.ts shows this name in its place, so renaming the library on the site is a change here alone.
export const name = "nishiki";
export const repository = "https://github.com/x-ryoppippi/nishiki";
export const description = "Atomic CSS-in-JS for React 19, with a compiler that extracts styles to static CSS.";
// GitHub Pages serves a project site under the repository's name.
export const base = `/${new URL(repository).pathname.split("/")[2]}/`;
