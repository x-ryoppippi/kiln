---
title: Why nishiki
description: Why nishiki exists, where it comes from, and the principles it is built on.
---

# Why nishiki

nishiki (nih-SHEE-kee, 錦) is Japanese for brocade: a fabric woven from many coloured threads into one cloth. nishiki weaves atomic rules, one per declaration, into the style of each element.

It is meant as the successor to styled-components for modern React: you keep writing `styled()` and the `css` prop, and in return the library works in React Server Components with no provider, ships only the CSS a page uses, and makes overrides land the same however the page was loaded.

## Why another CSS-in-JS library

styled-components and Emotion made colocated styles the default way to style React, and React has since moved under them.

- **React Server Components.** Both were built on React context and render-time insertion. Emotion still needs a Client Component (`'use client'`) in the App Router. styled-components added Server Component support in 6.3 by emitting `<style>` elements for React 19 to hoist, but `ThemeProvider` does nothing there, and in March 2025 its maintainers [announced maintenance mode](https://opencollective.com/styled-components/updates/thank-you), citing context being unavailable in Server Components.
- **Overrides that depend on order.** Both generate a class per style block and leave conflicts between the classes on one element to specificity and the order their rules sit in the stylesheet. Once code splitting or streaming decides which rules arrive first, an override that wins on one page can lose on another.
- **Everything at runtime.** Neither extracts static CSS: rules are generated while the app renders and travel inside its JavaScript.

nishiki keeps the authoring model and replaces the machinery under it.

## Where it comes from

nishiki is a fork of [restyle](https://github.com/souporserious/restyle) by [souporserious](https://github.com/souporserious). restyle got the foundations right, and nishiki keeps them:

- **Atomic rules.** One class per declaration, hashed from its input, so rules are shared across components and deduplicated.
- **React 19 style hoisting.** Rules are rendered as `<style href precedence>` elements, which React hoists into the head and deduplicates on the server and the client. That makes styling work in Server Components with no provider, no registry and no `'use client'`.
- **The API.** `styled()`, the `css` prop through the JSX import source, and `css()`.

nishiki adds what restyle leaves out:

- **Overrides decided by cascade layers.** restyle orders rules through three React precedence groups per nesting depth, so rules under different conditions fall back to the order React first inserted them. nishiki ranks every condition and property into a cascade layer instead (see [Overrides that do not depend on order](#overrides-that-do-not-depend-on-order)).
- **Merging per key.** Inputs merge per top-level key before any rule is emitted, so an override replaces what it overrides rather than adding a rule that competes with it.
- **An optional compiler** that compiles literal styles at build time with the same code as the runtime, and, in supported client builds, a lean runtime for the modules it compiles.
- **Static CSS split per entry and lazily loaded chunk**, planned from the bundler's chunk graph. It needs `extract` and a production client build with Vite, Rollup, Rolldown, webpack, Rspack, Rsbuild or Next.js with webpack.

[Comparison](./comparison.md#restyle) sets the two side by side, and [Migrating from restyle](./migrating-from-restyle.md) lists every API difference.

## Principles

### The ergonomics of styled-components

Styles are objects written next to the element they style, through `styled()`, the `css` prop or `css()`. Dynamic values are plain JavaScript: `{ color: active ? "red" : "gray" }` works with or without the compiler. Overriding a component means passing it `css` or wrapping it with `styled`, never fighting it with a more specific selector.

### Atomic CSS, merged per key

Every declaration becomes its own rule with its own class. Before rules are emitted, the inputs of one element merge per top-level key, later inputs winning, so `<Button css={{ color: "red" }} />` emits Button's rules with `color` replaced, not Button's `color` rule plus a second one. Keys that select the same elements merge as one (`"&:hover"` and `":hover"`), and a key that is overridden moves to where it was last set. The result is that an element styled through one merge carries at most one rule per property under each condition.

### Overrides that do not depend on order

When two rules set the same property on one element, nishiki decides which one applies without looking at the order they reached the document:

1. **The same key in two inputs:** the later input, because the merge drops the earlier one before any rule exists.
2. **Different conditions:** the higher-ranked condition. Conditions are ranked by category (media queries, container queries, `@supports`, attributes and ancestors, pseudo-classes) and within each category by a closed, configurable order: Tailwind's breakpoint ladder for widths and Tailwind CSS v4's variant order for pseudo-classes by default.
3. **The same condition:** the narrower property. A shorthand loses to the shorthands and longhands it covers, a logical longhand to its physical counterpart.

Rules 2 and 3 are encoded in cascade layers, which the browser applies before it looks at specificity or source order, so they hold whether a rule came from the runtime, an extracted stylesheet or both, and whichever route the visitor arrived from. [Technical background](./technical-background.md#cascade-layers-as-the-precedence-model) explains the encoding.

The guarantee has documented limits, where the order of rules in the document still decides:

- a condition the configured order does not list (it warns, and `strict: true` makes it a build error);
- two rules whose highest condition is the same, under two or more conditions, such as `:hover` under two different breakpoints;
- class names from separate `css()` calls joined by hand into one `className`;
- properties missing from the generated property table, and logical against physical properties outside a horizontal, left-to-right writing mode;
- unlayered CSS from elsewhere, which beats every layered rule, and `!important`, which reverses layer order (it warns).

[How it works](./how-it-works.md#not-ordered-by-layer) lists each of them with examples.

### No CSS bloat

A single global stylesheet grows with the whole application, and every page pays for it: on the largest benchmark fixture, a single sheet makes 97% of the first page's rules ones it never uses (see [Technical background](./technical-background.md#why-per-route-beats-one-sheet)). Atomic rules keep each rule small and shared; splitting keeps each page's CSS to what that page can render. With `extract`, each entry and lazily loaded chunk gets a stylesheet that leaves out the rules certainly loaded whenever it arrives. A rule shared by routes that may each load first is repeated in each of their sheets, so a visitor to several routes can fetch it more than once. On the benchmark fixtures, a navigation fetches one small stylesheet for its route.

### Modern browsers only

nishiki builds on cascade layers, React 19 and, for extracted CSS in ES module output from Rollup and Rolldown, top-level `await`. It does not polyfill or down-level them, and the rules it extracts skip PostCSS and Lightning CSS `targets`. In exchange, precedence is a browser feature rather than a convention the library has to maintain.

### Measured, not assumed

Each change to the compiler or the splitting is measured with the repository's [benchmark](./benchmarks.md) on fixtures of 8, 32 and 128 lazily loaded routes, for bytes on first load, per navigation and over a visit to every route, request counts, unused CSS, duplicate rules, build time and, in headless Chromium, style and layout time. Ideas that do not pay their way are dropped: hoisting widely shared route rules into the entry's sheet cut navigation bytes but put up to 41% unused CSS on the first load and could reorder rules in rare graphs, so it was left out.

### The compiler is optional, and removes runtime when used

Everything works at runtime with no build step. With the compiler, literal styles are compiled at build time with the same code the runtime uses, so class names are identical either way; fully static styles become module-level constants, so a render does no style work for them; non-literal values become custom properties that one static rule per property reads where they reach an element, and are otherwise ranked at build time and only formatted at runtime; and in supported client builds compiled modules load a lean runtime without the condition ranker. With `extract`, the rules leave the JavaScript for static, split stylesheets. The aim is to leave at runtime only what genuinely depends on runtime values.
