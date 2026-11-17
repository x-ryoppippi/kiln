---
title: How it works
description: Atomic rules, hashed class names, ranked conditions and cascade layers.
---

# How it works

## Atomic rules

Each top-level key of a style object compiles to an entry of atomic rules. A rule's class name hashes the property, the value as written, the normalised selector, the at-rules and the layer, so the same input always gets the same class (`margin: 8` and `margin: "8px"` produce the same CSS under different classes), whether the runtime or the compiler produced it.

## What wins

When two rules set the same property on one element:

- The same key in two inputs: the later input, since only its rules are applied.
- Different conditions: the higher-ranked condition, whatever order the rules arrive in, from the runtime, from an extracted stylesheet, or both. A style with no condition ranks lowest.
- The same condition: the narrower property. A shorthand loses to the shorthands and longhands it covers (`margin` < `marginInline` < `marginInlineStart` < `marginLeft`), a logical longhand to its physical counterpart, and `all` to everything.

## Conditions

A condition is an at-rule, an ancestor or sibling selector before `&` (`".dark &"`), an attribute or class on the element (`"&[data-state=open]"`), or a pseudo-class on it (`":hover"`). Pseudo-elements and descendants (`"::before"`, `"& span"`) pick which element a rule styles and are not conditions. Conditions rank by category, lowest first, then within it:

1. `@media`: the breakpoint ladder, `(max-width)` and `(width <)` queries at its widths descending, then `(min-width)` and `(width >=)` queries ascending, then other media queries in order: `(hover: hover)`, `(prefers-reduced-motion: no-preference)`, `(prefers-reduced-motion: reduce)`, `(prefers-contrast: more)`, `(prefers-contrast: less)`, `(orientation: portrait)`, `(orientation: landscape)`, `(prefers-color-scheme: dark)`, `print`, `(forced-colors: active)`.
2. `@container`: none by default.
3. `@supports` and other at-rules: `@starting-style`.
4. Attributes, classes and ancestors: `[open]`, `[inert]`, then `[aria-busy=true]`, `[aria-checked=true]`, `[aria-disabled=true]`, `[aria-expanded=true]`, `[aria-hidden=true]`, `[aria-pressed=true]`, `[aria-readonly=true]`, `[aria-required=true]`, `[aria-selected=true]`.
5. Pseudo-classes, in Tailwind CSS v4's variant order: `:first-child`, `:last-child`, `:only-child`, `:nth-child(odd)`, `:nth-child(even)`, `:first-of-type`, `:last-of-type`, `:only-of-type`, `:visited`, `:target`, `:popover-open`, `:open`, `:default`, `:checked`, `:indeterminate`, `:placeholder-shown`, `:autofill`, `:optional`, `:required`, `:valid`, `:invalid`, `:user-valid`, `:user-invalid`, `:in-range`, `:out-of-range`, `:read-only`, `:empty`, `:focus-within`, `:hover`, `:focus`, `:focus-visible`, `:active`, `:enabled`, `:disabled`.

A rule under two or more conditions, such as `{ "@media (min-width: 40rem)": { ":hover": … } }`, ranks by the highest of them, above every rule under one condition.

The default breakpoints are Tailwind's: `40rem`, `48rem`, `64rem`, `80rem` and `96rem`. A width counts 16px per `rem`, so `(min-width: 640px)` is on the ladder. Configure your own through the compiler's `conditions` option, or `configure()` without the compiler:

```ts
nishiki({
  conditions: {
    breakpoints: ["600px", "900px"],
    // Lists a category's conditions in rank order, lowest first, replacing the defaults for that category only.
    order: ["[data-state=open]", ".dark &", ":hover", ":focus-visible", ":active"],
    strict: true,
  },
});
```

The compiler configures the runtime with the same conditions in every environment it compiles for, from every module it compiles or that leaves styles to runtime, before any style there is compiled. `configure()` is for runtime-only use; with the compiler, pass the conditions to it instead. Breakpoints are widths in `px`, `rem` or `em`; anything else throws. A condition the order does not list shares one rank with every other unlisted condition of its category, so the order of their rules decides between them. You get a warning for each one in development and in the build, and `strict: true` makes it a build error. No layer is ever added for such a condition, so every page declares the same layers.

## Cascade layers

A rule's rank is its top-level layer: `n0` for no condition, and up from there. A broader property sits in nested layers inside it (`n0.a.a.a` for `padding`), since a layer's own rules win over its sublayers.

```css
@layer n0.a.a.a {
  .ne962m0 {
    padding: 8px 16px;
  }
}
@layer n0 {
  .n1fxj9np {
    color: white;
  }
}
@layer n1t.a.a {
  .n127hgyq:hover {
    background: #1158c7;
  }
}
```

The runtime inserts the order of every layer, `layerOrder()`, once, ahead of its rules, and React hoists it to the start of the head. Extracted CSS declares only the layers the build uses, in the same relative order. A planned sheet that may load first declares all of them, and one that always loads after such a sheet leaves the statement out; the stylesheets of one chunk group load in no set order, so each of them that may load first declares it. A CSS module per source module declares the layers up to the highest it uses, which any other module's statement extends consistently.

Rules the runtime inserts land between extracted rules by rank as long as its statement precedes the extracted one in the document. React's hoisting sees to that: the styles go at the start of the head, or, when rendered on the server, in the head before any other stylesheet. If you render the app into a template whose head links extracted stylesheets before React's output, render `<style>{layerOrder()}</style>` at the top of the head; otherwise a runtime rule in a layer that no extracted sheet uses ranks above every extracted rule.

Unlayered CSS beats layered CSS. Put global and third-party styles in a layer declared before these styles load if the library should win over them. Do not raise specificity or use `!important` to fight its rules; rank the condition instead.

## Not ordered by layer

These still fall back to the order of rules in the document, which depends on load order:

- Conditions that the order does not list.
- Two rules under two or more conditions with the same highest condition, such as `{ "@media (min-width: 40rem)": { ":hover": … } }` against `{ "@media (min-width: 64rem)": { ":hover": … } }`, and one condition written under two keys that do not merge, such as `{ "@media print": { ":hover": … } }` against `{ ":hover": { "@media print": … } }`.
- Class names from separate `css()` calls joined into one `className`, which cannot be merged: two rules for one property under one condition tie. Pass both to one call instead.
- Properties missing from the property table, which count as longhands, and logical against physical properties, which assume a horizontal, left-to-right writing mode.
- `!important`: it reverses layer precedence, so an important declaration in a lower layer beats one in a higher layer. You get a warning for each one in development and in the build.

## At runtime

Without the compiler, each style object is compiled as it renders, and its rules are inserted through React's `<style href precedence>` hoisting. This works in Server Components and Client Components alike, and React deduplicates the rules.

## At build time

The compiler compiles the literal parts of `css(...)`, `styled(_, {...})` and `css={{...}}` at build time with the same code the runtime uses, so class names are identical either way. A non-literal value of a property, such as `{ color: active ? "red" : "gray" }`, is ranked at build time and only formatted at runtime. Styles with no runtime part are hoisted to module scope, so a render does no style work for them; those with a runtime part, such as a spread, still merge it on each render. With [`extract`](./extraction.md), their rules leave the JavaScript for static stylesheets.

In client builds with Vite, Rollup, Rolldown, webpack, Rspack, esbuild and Farm, compiled modules import `@nishikijs/react`, `@nishikijs/react/jsx-runtime` and `@nishikijs/react/jsx-dev-runtime` from `@nishikijs/react/lean`, which leaves out the compiler that ranks conditions at runtime. A module that still hands the runtime a style object to compile, such as a spread, a selector or at-rule key with a non-literal value, or a `styled` resolver function, imports `@nishikijs/react/compiler` to load it. A dependency whose source mentions `css` or `styled`, Vite's dev server and server environments, Bun and Turbopack keep the full entries.

## Debugging

- A missing style: check the element has the `n…` class, that the rule exists in `<style data-precedence="nishiki">` or in the extracted CSS, and that no unlayered rule overrides it.
- A style that wins or loses depending on navigation: look for an unranked-condition warning, or two rules for the property in the same top-level `@layer`.
- To confirm the compiler ran, look in the built JavaScript for precomputed rules such as `@layer n0.a.a.a{.ne962m0{padding:8px 16px}}`, or, with `extract`, in the CSS. Without the compiler, only the style objects are there.
