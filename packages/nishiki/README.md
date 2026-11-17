# nishiki

<p>
  <a href="https://www.npmjs.com/package/@nishikijs/react"><img src="https://img.shields.io/npm/v/@nishikijs/react" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@nishikijs/react"><img src="https://img.shields.io/npm/dm/@nishikijs/react" alt="npm downloads" /></a>
</p>

nishiki (nih-SHEE-kee, 錦 — brocade): many coloured threads woven into one fabric, as atomic rules are woven into one style.

nishiki is atomic CSS-in-JS for React 19, meant as the successor to styled-components for modern React. You keep `styled()` and the `css` prop, overrides land the same whatever order stylesheets load in, and it works in Server Components. An optional compiler bakes literal styles at build time and extracts CSS per route.

**Documentation: [nishiki.ryoppippi.com](https://nishiki.ryoppippi.com)**

> [!WARNING]
> nishiki is experimental. The API and the generated class names may change.

## Major Sponsors

<p align="center">
    <a href="https://coderabbit.link/ryoppippi">
        <picture>
            <source media="(prefers-color-scheme: dark)" srcset="https://cdn.jsdelivr.net/gh/x-ryoppippi/nishiki@main/docs/public/coderabbit-logo-dark.svg">
            <img src="https://cdn.jsdelivr.net/gh/x-ryoppippi/nishiki@main/docs/public/coderabbit-logo.svg" alt="CodeRabbit" width="320">
        </picture>
    </a>
    &nbsp;&nbsp;&nbsp;&nbsp;
    <a href="https://blacksmith.sh">
        <picture>
            <source media="(prefers-color-scheme: dark)" srcset="https://cdn.jsdelivr.net/gh/x-ryoppippi/nishiki@main/docs/public/blacksmith-logo-dark.svg">
            <img src="https://cdn.jsdelivr.net/gh/x-ryoppippi/nishiki@main/docs/public/blacksmith-logo.svg" alt="CI powered by Blacksmith" width="320">
        </picture>
    </a>
</p>

## Install

```sh
pnpm add @nishikijs/react
```

Set the JSX import source so host elements accept a `css` prop:

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "jsxImportSource": "@nishikijs/react",
  },
}
```

## Usage

```tsx
import { styled } from "@nishikijs/react";

const Button = styled("button", {
  padding: "8px 16px",
  borderRadius: 6,
  background: "#1f6feb",
  color: "white",
  ":hover": { background: "#1158c7" },
});

export function Counter({ count }: { count: number }) {
  return (
    <main css={{ display: "grid", gap: 12 }}>
      <p css={{ margin: 0, color: count % 2 ? "crimson" : "seagreen" }}>Clicked {count} times</p>
      <Button css={{ justifySelf: "start" }}>Increment</Button>
    </main>
  );
}
```

## Compiler

Optional. With Vite:

```ts
// vite.config.ts
import react from "@vitejs/plugin-react";
import nishiki from "@nishikijs/react/unplugin/vite";

export default {
  plugins: [nishiki({ extract: true }), react({ jsxImportSource: "@nishikijs/react" })],
};
```

Rollup, Rolldown, webpack, Rspack, Rsbuild, esbuild, Bun, Farm, unloader and Next.js are covered in [Bundler setup](https://nishiki.ryoppippi.com/compiler/).

## Learn more

- [Getting started](https://nishiki.ryoppippi.com/getting-started/)
- [Styling API](https://nishiki.ryoppippi.com/styling/): the `css` prop, `styled`, `css()`, merging and style objects
- [How it works](https://nishiki.ryoppippi.com/how-it-works/): what wins, conditions, cascade layers and what they do not order
- [Bundler setup](https://nishiki.ryoppippi.com/compiler/) and [Extraction and CSS splitting](https://nishiki.ryoppippi.com/extraction/)
- [Migrating from restyle](https://nishiki.ryoppippi.com/migrating-from-restyle/)

The package also ships an [agent skill](https://agentskills.io) in `skills/nishiki`.

## GitHub Sponsors

<p align="center">
    <a href="https://github.com/sponsors/ryoppippi">
        <img src="https://sponsors.ryoppippi.com/sponsors.png" alt="Sponsors">
    </a>
</p>

## Licence

MIT. The shorthand lists and selector helpers are adapted from [restyle](https://github.com/souporserious/restyle) (MIT).
