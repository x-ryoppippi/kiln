---
title: Comparison
description: How nishiki compares with restyle, styled-components, Emotion, StyleX, Tailwind CSS, vanilla-extract, Panda CSS and Linaria.
---

# Comparison

Each of these libraries makes a different trade-off, and each is a reasonable choice for some codebases. This page sets out where nishiki differs, as of November 2026; corrections are welcome.

| Library           | Authoring                           | Rules generated                        | Server Components, no `'use client'` | Atomic                 | Conflicts on one element decided by                                    | Static CSS     | CSS per route                   |
| ----------------- | ----------------------------------- | -------------------------------------- | ------------------------------------ | ---------------------- | ---------------------------------------------------------------------- | -------------- | ------------------------------- |
| nishiki           | `styled`, `css` prop, `css()`       | At render, or at build with a compiler | Yes                                  | Yes                    | Per-key merge, then cascade layers ranked by condition and property    | With `extract` | Planned from the chunk graph    |
| restyle           | `styled`, `css` prop, `css()`       | At render                              | Yes                                  | Yes                    | Object spread, then three property tiers per nesting depth, then order | No             | On demand, as components render |
| styled-components | `styled`, tagged templates, objects | At render                              | Since 6.3                            | No                     | Specificity and order in the stylesheet                                | No             | On demand, as components render |
| Emotion           | `css` prop, `styled`                | At render                              | No                                   | No                     | Composition into one class, else order in the stylesheet               | No             | On demand, as components render |
| StyleX            | `stylex.create`, `stylex.props`     | At build (compiler required)           | Yes                                  | Yes                    | Merge in `props`, then priorities through specificity or layers        | Yes            | One stylesheet                  |
| Tailwind CSS v4   | Utility class names                 | At build, from scanned sources         | Yes                                  | Utilities              | Order of utilities in the generated stylesheet                         | Yes            | One stylesheet                  |
| vanilla-extract   | `style()` in `.css.ts` files        | At build                               | Yes                                  | With Sprinkles         | Specificity and order in the stylesheet                                | Yes            | The bundler's CSS handling      |
| Panda CSS         | `css()`, recipes, JSX factory       | At build, by static analysis           | Yes                                  | Yes                    | Its cascade layers, then order within them                             | Yes            | One stylesheet                  |
| Linaria           | `css`, `styled`                     | At build                               | `css`: yes                           | With `@linaria/atomic` | Specificity and order in the stylesheet                                | Yes            | The bundler's CSS handling      |

## restyle

nishiki is a fork of [restyle](https://github.com/souporserious/restyle) by souporserious, and owes it the core design: atomic rules, rendered as React 19 `<style href precedence>` elements so that they work in Server Components and are deduplicated by React, behind the `styled`, `css` prop and `css()` API. restyle describes itself as "the simplest way to add CSS styles to your React components", needs no configuration and states a size of 2.2 kB minified and gzipped. Compared here with restyle 3.4.3:

|                 | restyle                                                                                                                                                                                                           | nishiki                                                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API             | `styled`, `css` prop, `css(styles, nonce)`, `GlobalStyles`, `keyframes`, `media`                                                                                                                                  | `styled`, `css` prop, `css(...styles)`; global styles and keyframes go in a regular stylesheet                                                                             |
| Style props     | Props the resolver reads, found through a proxy                                                                                                                                                                   | Props whose names start with `$`                                                                                                                                           |
| Inserting rules | One `<style>` per rule, under the precedence groups `rsl`, `rsm` and `rsh` for each nesting depth                                                                                                                 | One `<style>` per rule, under one precedence group that starts with the layer order                                                                                        |
| Overrides       | `styled` spreads the `css` prop over its styles; wrapping a styled component passes both class lists down                                                                                                         | Inputs merge per top-level key, `"&:hover"` and `":hover"` as one key; wrapping merges the outer styles into the inner ones                                                |
| Precedence      | Broad shorthands, then narrower shorthands such as `marginInline`, then everything else, per nesting depth; React orders the groups by first insertion, and the order rules were inserted decides everything else | Cascade layers ranked by condition, then property depth from a generated table; document order decides only the [documented cases](./how-it-works.md#not-ordered-by-layer) |
| Compiler        | None                                                                                                                                                                                                              | Optional, for 10 bundlers and Next.js, with the same output as the runtime                                                                                                 |
| Runtime         | 2.2 kB gzipped, by its README                                                                                                                                                                                     | 4.98 kB gzipped in full, 1.77 kB for compiled modules                                                                                                                      |
| Static CSS      | None: rules load as components render                                                                                                                                                                             | With `extract`, split per entry and lazily loaded chunk                                                                                                                    |

Why the changes:

- **Precedence by layer, not by insertion.** React orders `precedence` groups by the first time it sees each one, and orders rules within a group by when they were inserted. Two media queries for one property, or `:hover` against `:focus`, therefore depend on which component rendered first, which follows the visitor's path through the app. Ranking conditions into layers removes that dependency; see [Technical background](./technical-background.md#cascade-layers-as-the-precedence-model).
- **Merging before emitting.** Merging per key means an override replaces the rule it overrides instead of adding one that has to win in the cascade, so an element carries one rule per property under each condition.
- **A compiler and a lean runtime.** Ranking every condition at runtime costs bytes and render time. The compiler moves that work to the build, and the modules it compiles load a runtime without the ranker.
- **Per-route stylesheets.** Extracted, split CSS lets the browser fetch rules in parallel with the script and fetch each rule at most once on a path.

[Migrating from restyle](./migrating-from-restyle.md) lists every API difference.

## styled-components and Emotion

Both generate CSS while the app renders, from tagged templates or objects, with one class per style block rather than one per declaration. nishiki offers the same `styled` and `css` prop ergonomics, with objects rather than template strings. styled-components has supported Server Components since 6.3 by emitting `<style>` elements for React 19 to hoist, though `ThemeProvider` does nothing there; Emotion still needs `'use client'` in the Next.js App Router. Emotion composes several styles passed to one `css` prop into one class, so the last one wins, which is close to nishiki's merge; classes from separate sources still compete in the stylesheet. Neither extracts static CSS.

## StyleX

StyleX is the closest in spirit: atomic rules, a merge in which the last style applied wins, and precedence that does not depend on load order. The differences are in where the work happens and how precedence is encoded. StyleX requires its compiler and emits one stylesheet for the app; nishiki works without a build step and, with one, splits stylesheets per route. StyleX encodes priorities (shorthands below longhands, pseudo-classes and media queries above plain rules) by raising specificity with `:not(#\#)`, or with cascade layers when `useLayers` is set; nishiki always uses layers, and orders media queries by a breakpoint ladder and pseudo-classes by a configurable order.

## Tailwind CSS

Tailwind generates one stylesheet from the class names it finds in the sources, in native cascade layers, with variants and breakpoints sorted. nishiki borrows its default breakpoint ladder and Tailwind CSS v4's variant order. The differences: styles are objects next to the component rather than class names, overriding a component is a merge rather than a class that has to come later in the sheet, and CSS is split per route instead of growing as one sheet with the whole application.

## vanilla-extract, Panda CSS and Linaria

All three move styles to build time. vanilla-extract writes them in `.css.ts` files, with atomic utilities from Sprinkles; Panda analyses `css()` calls and recipes statically and emits atomic CSS in its own cascade layers; Linaria extracts `css` and `styled` from ordinary modules and passes dynamic values through custom properties. They need their build step; nishiki also runs without one, so a style that cannot be compiled still works, and the compiler only removes runtime work where it can.
