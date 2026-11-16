---
name: kiln
description: When writing, reviewing or debugging React styles that use kiln (the `css` prop, `styled` or `css()`) or its compiler (`kiln/unplugin`).
---

# kiln

API, setup per bundler and how it works: `node_modules/kiln/README.md`.

## Writing styles

- Use the `css` prop on host elements, `styled` for reusable components, and `css()` only when a class name string is needed (render the `Styles` it returns).
- Write values that never change as literals in place, not through variables, helpers or spreads. The compiler only compiles literals.
- Keep dynamic values in their own keys; the other literal keys of the same object are still compiled.
- Compose by passing several inputs (`css(base, active && selected)`, `css={[base, override]}`); later inputs win per top-level key, and `null` unsets a key.
- Name props that only drive styles with a `$` prefix (`$tone`); `styled` passes them to the resolver and never to the element.
- Never join class names from separate kiln calls into one `className`, and never override a kiln component through `className`. Pass its `css` prop or wrap it with `styled`.
- Keys are camelCase CSS properties, `--custom-properties`, nested selectors containing `&` or starting with `:`, and at-rules (`@media`, `@supports`, `@container`).

## Setup

- Set `jsxImportSource` to `kiln` in `tsconfig.json` and in the framework's React plugin.
- Add the plugin from `kiln/unplugin/<bundler>` before the React plugin; for Next.js wrap the config with `kiln/unplugin/next`.
- Use `extract: true` for a static stylesheet. It has no effect under Turbopack.

## Cascade

- Of two rules for one property, the one under the higher-ranked condition wins, then the narrower property; load order does not decide. The README's Conditions section has the order.
- Use media queries on the breakpoint ladder and conditions the order lists. For any other, add it to the plugin's `conditions.order` (or `breakpoints`) rather than relying on rule order; kiln warns about each unranked condition.
- Do not nest two conditions under two keys for the same property and element when they share their highest condition (`@media (min-width: 40rem)` and `@media (min-width: 64rem)` each holding `:hover`); they tie.
- kiln rules live in cascade layers named `k…`. Unlayered CSS always beats them: put global and third-party CSS in a layer that is declared before kiln's styles load.
- Do not raise specificity or use `!important` to fight kiln rules; rank the condition instead.

## Debugging

- A missing style: check the element has the `k…` class, the rule exists in `<style data-precedence="kiln">` or the extracted CSS, and no unlayered rule overrides it.
- To confirm the compiler ran, look for `_kiln$` in the built output.
- A style that wins or loses depending on navigation: look for an unranked-condition warning, or two rules for the property in the same top-level `@layer`.
