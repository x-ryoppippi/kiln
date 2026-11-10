# kiln

Atomic CSS-in-JS for React 19, with an optional compile step that bakes literal styles at build time.

- Write styles where they are used: a `css` prop, `styled`, or `css()`.
- Works without a build step, in Server Components and Client Components alike: rules are inserted through React's `<style href precedence>` hoisting.
- With `unplugin-kiln`, literal styles are compiled with oxc at build time, hoisted to module scope and cached, so a render does no style work at all. Anything that is not a literal keeps working at runtime.
- Optionally extract compiled rules into a static stylesheet.
- Precedence comes from cascade layers, not insertion order, so composition is predictable.

> [!WARNING]
> kiln is experimental. The API and the generated class names may change.

## Install

```sh
pnpm add kiln
pnpm add -D unplugin-kiln # optional compiler
```

Set the JSX import source so host elements accept a `css` prop:

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "jsxImportSource": "kiln",
  },
}
```

## Usage

```tsx
import { css, styled } from "kiln";

const Button = styled("button", {
  padding: "8px 16px",
  borderRadius: 6,
  background: "#1f6feb",
  color: "white",
  ":hover": { background: "#388bfd" },
  "@media (max-width: 600px)": { width: "100%" },
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

- **`css` prop** on host elements: style objects, compiled styles, `null`/`false`, or lists of them.
- **`styled(component, styles)`** returns a component that accepts `className` and `css`. `styles` can be a function `(styleProps, props) => styles`, where style props are the props whose names start with `$`; they are never forwarded to the element.

```tsx
const Badge = styled("span", ({ $tone }: { $tone: "info" | "danger" }) => ({
  color: $tone === "danger" ? "crimson" : "steelblue",
}));

<Badge $tone="danger">Failed</Badge>;
```

- **`css(...styles)`** returns `[className, Styles]`; render `<Styles />` next to the element.

Inputs merge per top-level key, later inputs winning, and `null` unsets a key:

```tsx
<div css={[base, isActive && { color: "red" }, { margin: null }]} />
```

Wrapping a styled component with `styled` merges both style objects the same way, so the outer styles always win.

### Style objects

| Key                                                         | Meaning                                     |
| ----------------------------------------------------------- | ------------------------------------------- |
| `color`, `marginTop`, ...                                   | CSS properties in camelCase                 |
| `--brand`                                                   | Custom properties, passed through untouched |
| `":hover"`, `"&:focus-visible"`, `".dark &"`                | Nested selectors (`&` is the element)       |
| `"@media (...)"`, `"@supports (...)"`, `"@container (...)"` | At-rules, which can nest                    |

Numbers get `px` unless the property is unitless (`lineHeight`, `opacity`, `zIndex`, ...).

## Compiler

`unplugin-kiln` compiles the literal parts of `css(...)`, `styled(_, {...})` and `css={{...}}` at build time with the same compiler the runtime uses, so class names are identical either way.

```ts
// vite.config.ts
import react from "@vitejs/plugin-react";
import kiln from "unplugin-kiln/vite";

export default {
  plugins: [kiln(), react({ jsxImportSource: "kiln" })],
};
```

Entries: `unplugin-kiln/vite`, `/rollup`, `/rolldown`, `/webpack`, `/rspack`, `/rsbuild`, `/esbuild`, `/bun`, `/farm`, `/unloader`. For Next.js (webpack and Turbopack):

```ts
// next.config.ts
import withKiln from "unplugin-kiln/next";

export default withKiln({});
```

Options:

| Option         | Default  | Meaning                                                                  |
| -------------- | -------- | ------------------------------------------------------------------------ |
| `importSource` | `"kiln"` | Module `css` and `styled` are imported from                              |
| `cssProp`      | `true`   | Compile `css={{...}}` on JSX elements                                    |
| `extract`      | `false`  | Emit compiled rules as a CSS module instead of inserting them at runtime |

With webpack, Rspack and Rsbuild, `extract` needs the project root to be a real path, not one under a symlink such as macOS's `/var` or `/tmp`: unplugin stores the CSS module under the root as given, and the bundler resolves it to the real path, where it is missing.

What gets compiled:

- Literal values: strings, numbers, template literals without expressions, nested objects of literals, `null` and `undefined`.
- Everything up to the last spread or computed key stays as written and is resolved at runtime, because only runtime knows what it overrides. Literal keys after it are compiled.
- Other keys with non-literal values stay at runtime; the literal keys of the same object are still compiled.
- Styles with no runtime part are hoisted to module-level constants, and `resolve` caches their result by identity.

There is no evaluator and no cross-file analysis, so every file is transformed on its own and cached and hot-reloaded per file.

## How it works

Each top-level key compiles to an entry of atomic rules. A rule's class name hashes the property, value, normalised selector and at-rules, so the same declaration always gets the same class.

Rules are wrapped in cascade layers `k0` to `k11`: shorthands below mid-level shorthands below longhands, and each nesting level above the one before. Because the layer decides precedence, rules can arrive in any order, from the runtime, from an extracted stylesheet, or both.

Unlayered CSS beats layered CSS. Put global and third-party styles in a layer declared before kiln's styles load if kiln should win over them.

## Agent skill

The package ships an [agent skill](https://agentskills.io) in `skills/kiln` describing how to write styles that compile and how to debug them.

## Licence

MIT. The shorthand lists and selector helpers are adapted from [restyle](https://github.com/souporserious/restyle) (MIT).
