---
name: nishiki
description: When writing, reviewing or debugging React styles that use nishiki (the `css` prop, `styled` or `css()`) or its compiler (`@nishikijs/react/unplugin`).
---

# nishiki

API, setup per bundler and how it works: `node_modules/@nishikijs/react/README.md`.

## Writing styles

- Use the `css` prop on host elements, `styled` for reusable components, and `css()` only when a class name string is needed (render the `Styles` it returns).
- Write values that never change as literals in place, not through variables, helpers or spreads. The compiler only compiles literals.
- Keep dynamic values in their own keys; the other literal keys of the same object are still compiled.
- Compose by passing several inputs (`css(base, active && selected)`, `css={[base, override]}`); later inputs win per top-level key, and `null` unsets a key.
- Name props that only drive styles with a `$` prefix (`$tone`); `styled` passes them to the resolver and never to the element.
- Never join class names from separate nishiki calls into one `className`, and never override a nishiki component through `className`. Pass its `css` prop or wrap it with `styled`.
- Keys are camelCase CSS properties, `--custom-properties`, nested selectors containing `&` or starting with `:`, and at-rules that hold style rules (`@media`, `@supports`, `@container`, `@scope`, `@starting-style`, `@layer`). `@keyframes`, `@font-face`, `@property` and other at-rules are errors; write them in a plain stylesheet.

## Setup

- Set `jsxImportSource` to `@nishikijs/react` in `tsconfig.json` and in the framework's React plugin.
- Add the plugin from `@nishikijs/react/unplugin/<bundler>` before the React plugin; for Next.js wrap the config with `@nishikijs/react/unplugin/next`.
- Use `extract: true` for a static stylesheet. It has no effect under Turbopack.

## Cascade

- Of two rules for one property under ranked conditions, the one under the higher-ranked condition wins, then the narrower property, whatever order they load in. Unranked conditions, two-condition paths that share their highest condition, and one condition under two keys that do not merge still fall back to document order. The README's Conditions and "Not ordered by layer" sections have the details.
- Use media queries on the breakpoint ladder and conditions the order lists. For any other, add it to the plugin's `conditions.order` (or `conditions.breakpoints`) rather than relying on rule order; nishiki warns about each unranked condition.
- Do not nest two conditions under two keys for the same property and element when they share their highest condition (`@media (min-width: 40rem)` and `@media (min-width: 64rem)` each holding `:hover`); they tie.
- nishiki rules live in cascade layers inside one top-level layer, `nishiki` (`nishiki.n0`, `nishiki.n1t.a.a`). Unlayered CSS and any layer declared after `nishiki` beat them: put global and third-party CSS in a layer and declare `@layer reset, nishiki;` before nishiki's styles load (in React, as a `<style>` with its own `precedence` rendered before anything styled).
- Do not raise specificity or use `!important` to fight nishiki rules; rank the condition instead.

## Debugging

- A missing style: check the element has the `n…` class, the rule exists in `<style data-precedence="nishiki">` or the extracted CSS, and no unlayered rule overrides it.
- To confirm the compiler ran, look for precomputed rules such as `@layer nishiki.n0.a.a.a{.ne962m0{padding:8px 16px}}` in the built JavaScript, or, with `extract`, in the CSS. The compiler's `_nishiki$` helper is renamed by minifiers.
- A style that wins or loses depending on navigation: look for an unranked-condition warning, or two rules for the property in the same `@layer`.
