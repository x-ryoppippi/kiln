---
name: kiln
description: When writing, reviewing or debugging React styles that use kiln (the `css` prop, `styled` or `css()`) or its unplugin-kiln compiler.
---

# kiln

API, setup per bundler and how it works: `node_modules/kiln/README.md`.

## Writing styles

- Use the `css` prop on host elements, `styled` for reusable components, and `css()` only when a class name string is needed (render the `Styles` it returns).
- Write values that never change as literals in place, not through variables, helpers or spreads. The compiler only compiles literals.
- Put spreads and computed keys first and literal keys after them. Everything up to the last spread or computed key stays runtime-only.
- Keep dynamic values in their own keys; the other literal keys of the same object are still compiled.
- Compose by passing several inputs (`css(base, active && selected)`, `css={[base, override]}`); later inputs win per top-level key, and `null` unsets a key.
- Never join class names from separate kiln calls into one `className`, and never override a kiln component through `className`. Pass its `css` prop or wrap it with `styled`.
- Keys are camelCase CSS properties, `--custom-properties`, nested selectors containing `&` or starting with `:`, and at-rules (`@media`, `@supports`, `@container`).

## Setup

- Set `jsxImportSource` to `kiln` in `tsconfig.json` and in the framework's React plugin.
- Add the plugin from `unplugin-kiln/<bundler>` before the React plugin; for Next.js wrap the config with `unplugin-kiln/next`.
- Use `extract: true` for a static stylesheet. It has no effect under Turbopack.

## Cascade

- kiln rules live in cascade layers `k0` to `k11`. Unlayered CSS always beats them: put global and third-party CSS in a layer that is declared before kiln's styles load.
- Do not raise specificity or use `!important` to fight kiln rules; fix the layer instead.

## Debugging

- A missing style: check the element has the `k…` class, the rule exists in `<style data-precedence="kiln">` or the extracted CSS, and no unlayered rule overrides it.
- To confirm the compiler ran, look for `_kiln$` in the built output.
