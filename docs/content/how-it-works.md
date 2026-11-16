---
title: How it works
description: Atomic rules, hashed class names and cascade layers.
---

# How it works

## Atomic rules

Each top-level key of a style object compiles to an entry of atomic rules. A rule's class name hashes the property, value, normalised selector and at-rules, so the same declaration always gets the same class, whether the runtime or the compiler produced it.

## Cascade layers

Rules are wrapped in cascade layers `k0` to `k11`: shorthands below mid-level shorthands below longhands, and each nesting level above the one before. Because the layer decides precedence, rules can arrive in any order, from the runtime, from an extracted stylesheet, or both, and composition stays predictable.

```css
@layer k0, k1, k2, k3, k4, k5, k6, k7, k8, k9, k10, k11;
@layer k0 {
  .koz4kr5 {
    padding: 8px 16px;
  }
}
@layer k2 {
  .kgen44r {
    color: white;
  }
}
@layer k3 {
  .kxjtagr:hover {
    background: #388bfd;
  }
}
```

Unlayered CSS beats layered CSS. Put global and third-party styles in a layer declared before these styles load if the library should win over them. Do not raise specificity or use `!important` to fight its rules; fix the layer instead.

## At runtime

Without the compiler, each style object is compiled as it renders, and its rules are inserted through React's `<style href precedence>` hoisting. This works in Server Components and Client Components alike, and React deduplicates the rules.

## At build time

The compiler compiles the literal parts of `css(...)`, `styled(_, {...})` and `css={{...}}` at build time with the same code the runtime uses, so class names are identical either way. Compiled styles are hoisted to module scope, so a render does no style work for them. With [`extract`](./extraction.md), their rules leave the JavaScript for static stylesheets.

## Debugging

- A missing style: check the element has the `k…` class, that the rule exists in `<style data-precedence="kiln">` or in the extracted CSS, and that no unlayered rule overrides it.
- To confirm the compiler ran, look for `_kiln$` in the built output.
