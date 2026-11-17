---
title: Migrating from restyle
description: What changes when moving from restyle to this fork.
---

# Migrating from restyle

This library is a fork of [restyle](https://github.com/souporserious/restyle). The style objects and the `css` prop, `styled` and `css()` APIs are close enough that most components move over with import changes. This page lists what differs, compared with restyle 3.4.

## Package and JSX setup

```diff
- npm install restyle
+ npm install @nishikijs/react
```

```diff
  // tsconfig.json
- "jsxImportSource": "restyle"
+ "jsxImportSource": "@nishikijs/react"
```

Imports from `restyle` and its subpaths (`restyle/css`, `restyle/styled`, ...) all become imports from `@nishikijs/react`. restyle runs entirely at runtime; here the [compiler](./compiler.md) is an optional addition from `@nishikijs/react/unplugin/<bundler>`.

## Style props need a `$` prefix

restyle treats any prop that the resolver function reads as a style prop and removes it from the element. Here only props whose names start with `$` are style props. They all reach the resolver and none reach the element, whether or not the resolver reads them.

```diff
- const Grid = styled("div", ({ columns }: { columns: string }) => ({ gridTemplateColumns: columns }));
- <Grid columns="1fr 2fr" />
+ const Grid = styled("div", ({ $columns }: { $columns: string }) => ({ gridTemplateColumns: $columns }));
+ <Grid $columns="1fr 2fr" />
```

The second resolver argument is still the remaining props, which are forwarded as before.

## `css()` takes several inputs

restyle's `css(styles, nonce)` takes one style object and a nonce. Here `css(...styles)` takes any number of inputs, including arrays, `null`, `false` and compiled styles, and [merges them](./styling.md#merging) per top-level key. A second argument is therefore another style input, not a nonce, and the `Styles` component `css()` returns takes no props. To set a nonce, resolve the inputs yourself and render the exported `Styles` component with it:

```tsx
import { Styles } from "@nishikijs/react";
import { resolve } from "@nishikijs/react/core";

const [className, rules] = resolve([base, overrides]);

<div className={className}>
  <Styles rules={rules} nonce={nonce} />
</div>;
```

React adds the nonce to server-rendered styles only when the render is given the same value, such as `renderToReadableStream(app, { nonce: { style: nonce } })`. With that option set, React leaves out the rules of every `<style precedence>` without that nonce, and the `css` prop and `styled` render theirs without one. Under a nonce-based `style-src` policy, the only inline rules that reach the page are those rendered through `Styles` with the nonce. [Extracted](./extraction.md) stylesheets are loaded with `<link>`, so they apply only if the policy also allows their origin, such as with `'self'`, or their `<link>` carries the nonce.

## Removed APIs

`GlobalStyles`, `keyframes` and `media` have no counterpart. Media queries still work as keys, written as strings:

```diff
- [media({ maxWidth: 600 })]: { width: "100%" },
+ "@media (max-width: 600px)": { width: "100%" },
```

Write global styles and `@keyframes` in a regular stylesheet, and put it in a cascade layer if these styles should win over it (see below).

## Precedence comes from cascade layers

restyle orders rules by inserting them under several React `precedence` groups, so the outcome depends on which group React inserts first. Here every rule sits in a cascade layer chosen by the rank of its conditions and how much its property covers, so a rule under `:hover` beats one under a media query, and `marginLeft` beats `margin`, whichever order they arrive in. See [How it works](./how-it-works.md#what-wins).

Unlayered CSS beats layered CSS. If global or third-party styles used to lose to restyle's rules, put them in a layer declared before this library's styles load.

## Wrapping styled components

restyle passes the outer component's class names down as `className`, so both sets of rules apply and the cascade decides. Here wrapping a styled component with `styled` merges the outer styles into the inner ones per top-level key, so the outer styles always win, and `$` props reach the inner resolver too.

## Smaller differences

- Class names are hashed differently (`n…` instead of `l…`, `m…` and `h…`), so snapshots and selectors that relied on them change.
- Custom properties are passed through untouched; restyle converts `--brandColor` to `--brand-color`. Write custom property names in their final form.
- `false` is skipped like `null` and `undefined`.
- More properties are unitless, such as `aspectRatio` and `fillOpacity`, so numbers there no longer get `px`.
