# kiln

Atomic CSS-in-JS for React 19, with an optional compile step that bakes literal styles at build time.

- Write styles where they are used: a `css` prop, `styled`, or `css()`.
- Works without a build step, in Server Components and Client Components alike: rules are inserted through React's `<style href precedence>` hoisting.
- With the compiler in `kiln/unplugin`, literal styles are compiled with oxc at build time, hoisted to module scope and cached, so a render does no style work at all. Anything that is not a literal keeps working at runtime.
- Optionally extract compiled rules into a static stylesheet.
- Precedence comes from cascade layers: a rule under a higher-ranked condition wins over one under a lower-ranked condition, and a narrower property over a broader one, whatever order the rules arrive in.

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
| `conditions`   | `{}`     | How conditions rank; see [Conditions](#conditions)                         |

Where `extract` puts the rules:

- In a Vite client build, in Rollup and Rolldown builds, and in production client builds of webpack, Rspack, Rsbuild and Next.js with webpack, `extract: true` (or `{ split: "chunks" }`) gives each entry and each lazily loaded chunk that adds rules a sheet of its own: kiln emits it, or with webpack and the bundlers built on it adds it to a stylesheet the CSS pipeline emits, as described below. The sheet holds every rule that chunk needs except those certainly loaded whenever it arrives, in the order they run, so a page never misses a rule and never fetches one it is sure to have. Two lazily loaded chunks that load together and share a component each still carry its rules, since either may also load alone.
- `{ split: "single" }`, or Vite's `build.cssCodeSplit: false`, gives each entry one stylesheet with every rule it can reach.
- In chunk mode, `build.modulePreload: false` or `experimental.renderBuiltUrl` makes kiln warn and fall back to one stylesheet per entry.
- These Vite stylesheets do not pass through Vite's CSS pipeline, so PostCSS, `build.cssTarget` and Lightning CSS `targets` do not apply to kiln's rules.
- Vite library mode keeps a CSS module per source module, which Vite bundles into `build.lib.cssFileName`.
- With Rollup and Rolldown, kiln loads the stylesheets itself, so no CSS plugin is needed. Each chunk with a stylesheet waits for it with a top-level `await` before its code runs, so a lazily loaded chunk resolves only once its rules are in. A dynamic import of a string literal also starts loading the stylesheets of the chunk it imports alongside its JS, so they arrive in parallel; one with a computed specifier, such as a variable, starts fetching them only when the chunk starts to run. The few lines that load them are added to the chunks as they render, so chunk cycles from `manualChunks` or Rolldown's groups, Rolldown's `strictExecutionOrder`, an `external` function and renderChunk minifiers leave them working.
- `.kiln/manifest.json` in a Rollup or Rolldown output lists each chunk with, in `css`, the stylesheets that load with it; link the entry's `css` files from the page so they load with its script rather than after it. Output that is not an ES module cannot wait, so it gets one stylesheet per entry, which the page must link from `.kiln/manifest.<format>.json`, such as `.kiln/manifest.cjs.json`; in chunk mode kiln warns about this. Outputs of different formats can share a directory, but outputs of one format each need their own: kiln fails the build when an output of its build would overwrite another's manifest, but cannot see a separate build that writes to the same directory.
- With webpack, Rspack, Rsbuild and Next.js with webpack, kiln adds its rules to the stylesheets your CSS pipeline already emits, so the bundler's own CSS chunk loading, its HTML plugin and Next.js load them and no code of kiln's runs in the browser. That needs a pipeline that emits stylesheets, such as mini-css-extract-plugin, Rspack's `CssExtractRspackPlugin` or native CSS; a build without one, such as one with `style-loader` or a server build that keeps only the exports of CSS, keeps a CSS module per source module. kiln fails the build when such a pipeline keeps kiln's CSS in JavaScript anyway, or emits no stylesheet for a chunk that a sheet must go in. Each chunk group gets one sheet, in a chunk that only it loads; a chunk that several groups share, such as one `splitChunks` made, gets the rules of its own modules that are not certainly loaded when it arrives. A navigation therefore fetches one stylesheet for each chunk it loads that has CSS, which with the default `splitChunks` is one per lazily loaded route; a stylesheet that kiln leaves empty is dropped if only a page links it, as with Next.js's CSS chunking.
- There, kiln's rules skip the CSS pipeline's loaders, such as PostCSS or Rsbuild's Lightning CSS transform, but its minimiser still runs over them. The pipeline names a stylesheet before kiln adds to it, so kiln needs `optimization.realContentHash`, on by default in production, to give each its final name; without it kiln warns and imports a CSS module per source module instead. `realContentHash` renames only a stylesheet with `[contenthash]` in its name; if one has none, kiln warns and gives each stylesheet the rules of its own CSS modules, which repeats shared rules as a CSS module per source module does. With `{ split: "single" }`, a lazily loaded chunk that imported kiln's CSS still fetches its stylesheet, now without kiln's rules, and if an entry has no stylesheet to hold them kiln warns and splits by chunk instead.
- Next.js with webpack renders an App Router page inside the layouts and templates of its segment and those above it, so kiln leaves out of a page's stylesheet what they already load. `global-error` and `global-not-found` replace the root layout, so their stylesheets keep every rule they need.
- The Vite dev server, webpack, Rspack and Rsbuild builds with `mode: "development"`, a target other than the web or a CSS pipeline that emits no stylesheets, and bundlers other than these, import a CSS module per source module.
- Next.js with Turbopack ignores `extract` and inserts rules at runtime: Turbopack runs kiln as a loader, which cannot add CSS modules.

With webpack, Rspack and Rsbuild, `extract` needs the project root to be a real path, not one under a symlink such as macOS's `/var` or `/tmp`: unplugin stores the CSS module under the root as given, and the bundler resolves it to the real path, where it is missing.

What gets compiled:

- Literal values: strings, numbers, template literals without expressions, nested objects of literals, `null` and `undefined`.
- A style object with a spread, a computed key, a setter, a method or a non-literal value stays an object at runtime, and each of its literal values is compiled in place. JavaScript still builds the object, so its keys keep the order and the overrides they have without the compiler. A style object with a getter, or with a `__proto__` that is not a literal, is left to runtime as a whole, since a getter reads its values through `this`.
- Keys follow JavaScript: integer keys come first, and only a non-computed `__proto__: { … }` or `__proto__: null` sets the prototype, whose keys `css()` reads after the object's own; `["__proto__"]` is an ordinary key.
- A non-literal value of a property, such as `{ color: active ? "red" : "gray" }`, is ranked at build time and only formatted at runtime.
- Compiled styles and compiled values are hoisted to module-level constants, and `resolve` caches the result of fully compiled styles by identity.

There is no evaluator and no cross-file analysis, so every file is transformed on its own and cached and hot-reloaded per file.

In client builds with Vite, Rollup, Rolldown, webpack, Rspack, esbuild and Farm, the modules kiln compiles import `kiln`, `kiln/jsx-runtime` and `kiln/jsx-dev-runtime` from `kiln/lean`, which leaves out the compiler that ranks conditions at runtime. A module that still hands the runtime a style object to compile, such as a spread, a selector or at-rule key with a non-literal value, or a `styled` resolver function, imports `kiln/compiler` to load it. A dependency whose source mentions `css` or `styled`, Vite's dev server and server environments, Bun and Turbopack keep the full entries.

## How it works

Each top-level key compiles to an entry of atomic rules. A rule's class name hashes the property, value, normalised selector, at-rules and layer, so the same declaration always gets the same class.

What wins when two rules set the same property on one element:

- The same key in two inputs: the later input, since only its rules are applied.
- Different conditions: the higher-ranked condition, whatever order the rules arrive in, from the runtime, from an extracted stylesheet, or both. A style with no condition ranks lowest.
- The same condition: the narrower property. A shorthand loses to the shorthands and longhands it covers (`margin` < `marginInline` < `marginInlineStart` < `marginLeft`), a logical longhand to its physical counterpart, and `all` to everything.

### Conditions

A condition is an at-rule, an ancestor or sibling selector before `&` (`".dark &"`), an attribute or class on the element (`"&[data-state=open]"`), or a pseudo-class on it (`":hover"`). Pseudo-elements and descendants (`"::before"`, `"& span"`) pick which element a rule styles and are not conditions. Conditions rank by category, then within it:

1. `@media`: the breakpoint ladder, `(max-width)` and `(width <)` queries at its widths descending, then `(min-width)` and `(width >=)` queries ascending, then other media queries in order: `(hover: hover)`, `(prefers-reduced-motion: no-preference)`, `(prefers-reduced-motion: reduce)`, `(prefers-contrast: more)`, `(prefers-contrast: less)`, `(orientation: portrait)`, `(orientation: landscape)`, `(prefers-color-scheme: dark)`, `print`, `(forced-colors: active)`.
2. `@container`: none by default.
3. `@supports` and other at-rules: `@starting-style`.
4. Attributes, classes and ancestors: `[open]`, `[inert]`, then `[aria-busy=true]`, `[aria-checked=true]`, `[aria-disabled=true]`, `[aria-expanded=true]`, `[aria-hidden=true]`, `[aria-pressed=true]`, `[aria-readonly=true]`, `[aria-required=true]`, `[aria-selected=true]`.
5. Pseudo-classes, in Tailwind CSS v4's variant order: `:first-child`, `:last-child`, `:only-child`, `:nth-child(odd)`, `:nth-child(even)`, `:first-of-type`, `:last-of-type`, `:only-of-type`, `:visited`, `:target`, `:popover-open`, `:open`, `:default`, `:checked`, `:indeterminate`, `:placeholder-shown`, `:autofill`, `:optional`, `:required`, `:valid`, `:invalid`, `:user-valid`, `:user-invalid`, `:in-range`, `:out-of-range`, `:read-only`, `:empty`, `:focus-within`, `:hover`, `:focus`, `:focus-visible`, `:active`, `:enabled`, `:disabled`.

A rule under two or more conditions, such as `{ "@media (min-width: 40rem)": { ":hover": … } }`, ranks by the highest of them, above every rule under one condition.

The default breakpoints are Tailwind's, `40rem`, `48rem`, `64rem`, `80rem` and `96rem`; a width counts 16px per `rem`, so `(min-width: 640px)` is on the ladder. Configure your own through the plugin's `conditions` option, or `configure()` without the plugin:

```ts
kiln({
  conditions: {
    breakpoints: ["600px", "900px"],
    // Lists a category's conditions in rank order, lowest first, replacing kiln's defaults for that category only.
    order: ["[data-state=open]", ".dark &", ":hover", ":focus-visible", ":active"],
    strict: true,
  },
});
```

The plugin configures the runtime with the same conditions in every environment it compiles for, from every module it compiles or that leaves styles to runtime, before any style there is compiled. `configure()` is for runtime-only use; with the plugin, pass the conditions to the plugin. Breakpoints are widths in `px`, `rem` or `em`; anything else throws.

A condition that the order does not list shares one rank with every other unlisted condition of its category, so the order of their rules decides between them. kiln warns about each one in development and in the build; `strict: true` makes it a build error. kiln never adds a layer for it, so every page declares the same layers.

### Layers

A rule's rank is its top-level layer, `k0` for no condition and up from there. A broader property sits in nested layers inside it (`k0.a.a.a` for `margin`), since a layer's own rules win over its sublayers. The runtime inserts the order of every layer, `layerOrder()`, once, ahead of its rules. Extracted CSS declares only the layers the build uses, in the same relative order. A sheet kiln plans that may load first declares all of them, and one that always loads after such a sheet leaves the statement out; the stylesheets of one chunk group load in no set order, so each of them that may load first declares it. A CSS module per source module declares the layers up to the highest it uses, which any other module's statement extends consistently.

Rules the runtime inserts land between extracted rules by rank as long as its statement precedes the extracted one in the document, which React's hoisting does: kiln's styles go at the start of the head, or in the head before any other stylesheet when rendered on the server. If you render the app into a template whose head links extracted CSS before React's output, also render `<style>{layerOrder()}</style>` at the top of the head; otherwise a runtime rule in a layer that no extracted sheet uses ranks above every extracted rule.

### Not ordered by layer

These still fall back to the order of rules in the document, which depends on load order:

- Conditions that the order does not list, as above.
- Two rules under two or more conditions with the same highest condition, such as `{ "@media (min-width: 40rem)": { ":hover": … } }` against `{ "@media (min-width: 64rem)": { ":hover": … } }`, and one condition written under two keys that do not merge, such as `{ "@media print": { ":hover": … } }` against `{ ":hover": { "@media print": … } }`.
- Class names from separate `css()` calls joined into one `className`, which kiln cannot merge: two rules for one property under one condition tie. Pass both to one call instead.
- Properties missing from kiln's table, which count as longhands, and logical against physical properties, which assume a horizontal, left-to-right writing mode.
- `!important`: it reverses layer precedence, so an important declaration in a lower layer beats one in a higher layer. kiln warns about each one in development and in the build, and does not order them.

Unlayered CSS beats layered CSS. Put global and third-party styles in a layer declared before kiln's styles load if kiln should win over them.

## Agent skill

The package ships an [agent skill](https://agentskills.io) in `skills/kiln` describing how to write styles that compile and how to debug them.

## Licence

MIT. The shorthand lists and selector helpers are adapted from [restyle](https://github.com/souporserious/restyle) (MIT).
