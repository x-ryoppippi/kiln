# kiln

Atomic CSS-in-JS for React 19, with an optional compile step that bakes literal styles at build time.

- Write styles where they are used: a `css` prop, `styled`, or `css()`.
- Works without a build step, in Server Components and Client Components alike: rules are inserted through React's `<style href precedence>` hoisting.
- With the compiler in `kiln/unplugin`, literal styles are compiled with oxc at build time, hoisted to module scope and cached, so a render does no style work at all. Anything that is not a literal keeps working at runtime.
- Optionally extract compiled rules into a static stylesheet.
- For declarations without `!important`, cascade layers decide precedence whatever order the rules arrive in: a style at a shallower nesting depth loses to a more deeply nested one, and at the same depth shorthands lose to longhands. Depth comes first, so a nested shorthand beats a shallower longhand. Nesting levels from the third level down share one layer.

> [!WARNING]
> kiln is experimental. The API and the generated class names may change.

## Install

```sh
pnpm add kiln
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

Keys that select the same elements merge as one, so `"&:hover"` overrides `":hover"`, and a selector list such as `":hover, :focus"` merges per selector.

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

`kiln/unplugin` compiles the literal parts of `css(...)`, `styled(_, {...})` and `css={{...}}` at build time with the same compiler the runtime uses, so class names are identical either way.

```ts
// vite.config.ts
import react from "@vitejs/plugin-react";
import kiln from "kiln/unplugin/vite";

export default {
  plugins: [kiln(), react({ jsxImportSource: "kiln" })],
};
```

Place kiln after plugins that move code between modules, such as TanStack Router's code splitting, so each module it compiles imports only the rules its own code uses, and before the JSX transform.

Entries: `kiln/unplugin/vite`, `/rollup`, `/rolldown`, `/webpack`, `/rspack`, `/rsbuild`, `/esbuild`, `/bun`, `/farm`, `/unloader`. For Next.js (webpack and Turbopack):

```ts
// next.config.ts
import withKiln from "kiln/unplugin/next";

export default withKiln({});
```

Options:

| Option         | Default  | Meaning                                                                    |
| -------------- | -------- | -------------------------------------------------------------------------- |
| `importSource` | `"kiln"` | Module `css` and `styled` are imported from                                |
| `cssProp`      | `true`   | Compile `css={{...}}` on JSX elements                                      |
| `extract`      | `false`  | Emit compiled rules as CSS instead of inserting them at runtime; see below |

Where `extract` puts the rules:

- In a Vite client build, and in Rollup and Rolldown builds, `extract: true` (or `{ split: "chunks" }`) emits a stylesheet for each entry and each lazily loaded chunk that adds rules. It holds every rule that chunk needs except those certainly loaded whenever it arrives, in the order they run, so a page never misses a rule and never fetches one it is sure to have. Two lazily loaded chunks that load together and share a component each still carry its rules, since either may also load alone.
- `{ split: "single" }`, or Vite's `build.cssCodeSplit: false`, gives each entry one stylesheet with every rule it can reach.
- In chunk mode, `build.modulePreload: false` or `experimental.renderBuiltUrl` makes kiln warn and fall back to one stylesheet per entry.
- These Vite stylesheets do not pass through Vite's CSS pipeline, so PostCSS, `build.cssTarget` and Lightning CSS `targets` do not apply to kiln's rules.
- Vite library mode keeps a CSS module per source module, which Vite bundles into `build.lib.cssFileName`.
- With Rollup and Rolldown, kiln loads the stylesheets itself, so no CSS plugin is needed. Each chunk with a stylesheet waits for it with a top-level `await` before its code runs, so a lazily loaded chunk resolves only once its rules are in. A dynamic import of a string literal also starts loading the stylesheets of the chunk it imports alongside its JS, so they arrive in parallel; one with a computed specifier, such as a variable, starts fetching them only when the chunk starts to run. The few lines that load them are added to the chunks as they render, so chunk cycles from `manualChunks` or Rolldown's groups, Rolldown's `strictExecutionOrder`, an `external` function and renderChunk minifiers leave them working.
- `.kiln/manifest.json` in a Rollup or Rolldown output lists each chunk with, in `css`, the stylesheets that load with it; link the entry's `css` files from the page so they load with its script rather than after it. Output that is not an ES module cannot wait, so it gets one stylesheet per entry, which the page must link from `.kiln/manifest.<format>.json`, such as `.kiln/manifest.cjs.json`; in chunk mode kiln warns about this. Outputs of different formats can share a directory, but outputs of one format each need their own: kiln fails the build when an output of its build would overwrite another's manifest, but cannot see a separate build that writes to the same directory.
- The Vite dev server, and bundlers other than Vite, Rollup and Rolldown, import a CSS module per source module.
- Next.js with Turbopack ignores `extract` and inserts rules at runtime; under webpack it imports a CSS module per source module.

With webpack, Rspack and Rsbuild, `extract` needs the project root to be a real path, not one under a symlink such as macOS's `/var` or `/tmp`: unplugin stores the CSS module under the root as given, and the bundler resolves it to the real path, where it is missing.

What gets compiled:

- Literal values: strings, numbers, template literals without expressions, nested objects of literals, `null` and `undefined`.
- A style object with a spread, a computed key, a setter, a method or a non-literal value stays an object at runtime, and each of its literal values is compiled in place. JavaScript still builds the object, so its keys keep the order and the overrides they have without the compiler. A style object with a getter, or with a `__proto__` that is not a literal, is left to runtime as a whole, since a getter reads its values through `this`.
- Keys follow JavaScript: integer keys come first, and only a non-computed `__proto__: { … }` or `__proto__: null` sets the prototype, whose keys `css()` reads after the object's own; `["__proto__"]` is an ordinary key.
- Compiled styles and compiled values are hoisted to module-level constants, and `resolve` caches the result of fully compiled styles by identity.

There is no evaluator and no cross-file analysis, so every file is transformed on its own and cached and hot-reloaded per file.

## How it works

Each top-level key compiles to an entry of atomic rules. A rule's class name hashes the property, value, normalised selector, at-rules and layer, so the same declaration always gets the same class.

Rules are wrapped in cascade layers `k0` to `k11`: shorthands below mid-level shorthands below longhands, and each nesting level above the one before, up to the third, which deeper levels share. What wins when two rules set the same property on one element:

- The same key in two inputs: the later input, since only its rules are applied.
- A shorthand and a longhand, or two nesting depths that are not both three or more levels deep: the layer, whatever order the rules arrive in, from the runtime, from an extracted stylesheet, or both.
- Different conditions on one property in the same layer, such as two overlapping media queries: whichever rule comes later in the document. kiln emits an element's rules in the order its keys were last set, but a rule already inserted for another element keeps its earlier place, so this currently depends on load order. A fix is planned.

`!important` reverses layer precedence: an important declaration in an earlier layer beats one in a later layer, so an important shorthand wins over an important longhand.

Unlayered CSS beats layered CSS. Put global and third-party styles in a layer declared before kiln's styles load if kiln should win over them.

## Agent skill

The package ships an [agent skill](https://agentskills.io) in `skills/kiln` describing how to write styles that compile and how to debug them.

## Licence

MIT. The shorthand lists and selector helpers are adapted from [restyle](https://github.com/souporserious/restyle) (MIT).
