---
title: Getting started
description: Install the package, set the JSX import source and style your first component.
---

# Getting started

## Install

One package holds both the runtime and the compiler:

::: code-group

```sh [pnpm]
pnpm add kiln
```

```sh [npm]
npm install kiln
```

```sh [yarn]
yarn add kiln
```

```sh [bun]
bun add kiln
```

:::

It needs React 19.

## Set the JSX import source

Host elements accept a `css` prop once JSX is compiled with the library's runtime:

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "jsxImportSource": "kiln",
  },
}
```

Set the same import source in your bundler's React or JSX transform; [Bundler setup](./compiler.md) shows where for each one.

## Style a component

```tsx
import { styled } from "kiln";

const Button = styled("button", {
  padding: "8px 16px",
  borderRadius: 6,
  background: "#1f6feb",
  color: "white",
  ":hover": { background: "#1158c7" },
  "@media (max-width: 600px)": { width: "100%" },
});

export function Counter({ count }: { count: number }) {
  return (
    <main css={{ display: "grid", gap: 12 }}>
      <p css={{ margin: 0, color: count % 2 ? "crimson" : "seagreen" }}>
        Clicked {count} {count === 1 ? "time" : "times"}
      </p>
      <Button css={{ justifySelf: "start" }}>Increment</Button>
    </main>
  );
}
```

This already works without a build step: the runtime compiles each style object as it renders and inserts its rules through React.

## Add the compiler

The compiler is optional, but it moves the work of literal styles from render time to build time and can extract them into static CSS. With Vite, which needs `vite` and `@vitejs/plugin-react` installed:

```ts
// vite.config.ts
import react from "@vitejs/plugin-react";
import kiln from "kiln/unplugin/vite";

export default {
  plugins: [kiln(), react({ jsxImportSource: "kiln" })],
};
```

Other bundlers and Next.js are covered in [Bundler setup](./compiler.md).

## Agent skill

The package ships an [agent skill](https://agentskills.io) in `skills/kiln` describing how to write styles that compile and how to debug them.
