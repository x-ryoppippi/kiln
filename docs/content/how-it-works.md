---
title: How it works
description: Atomic rules, hashed class names and cascade layers.
---

# How it works

## Atomic rules

Each top-level key of a style object compiles to an entry of atomic rules. A rule's class name hashes the property, the value as written, the normalised selector, the at-rules and the layer, so the same input always gets the same class (`margin: 8` and `margin: "8px"` produce the same CSS under different classes), whether the runtime or the compiler produced it.

## Cascade layers

Rules are wrapped in cascade layers `k0` to `k11`: shorthands below mid-level shorthands below longhands, and each nesting level above the one before, up to the third, which deeper levels share. What wins when two rules set the same property on one element:

- The same key in two inputs: the later input, since only its rules are applied.
- A shorthand and a longhand, or two nesting depths that are not both three or more levels deep: the layer, whatever order the rules arrive in, from the runtime, from an extracted stylesheet, or both.
- Different conditions on one property in the same layer, such as two overlapping media queries: whichever rule comes later in the document. Rules for an element are emitted in the order its keys were last set, but a rule already inserted for another element keeps its earlier place, so this currently depends on load order. A fix is planned.

`!important` reverses layer precedence: an important declaration in an earlier layer beats one in a later layer, so an important shorthand wins over an important longhand.

```css
@layer k0, k1, k2, k3, k4, k5, k6, k7, k8, k9, k10, k11;
@layer k0 {
  .k74b6co {
    padding: 8px 16px;
  }
}
@layer k2 {
  .k1fxj9l0 {
    color: white;
  }
}
@layer k3 {
  .kpbdtkf:hover {
    background: #1158c7;
  }
}
```

Unlayered CSS beats layered CSS. Put global and third-party styles in a layer declared before these styles load if the library should win over them. Do not raise specificity or use `!important` to fight its rules; fix the layer instead.

## At runtime

Without the compiler, each style object is compiled as it renders, and its rules are inserted through React's `<style href precedence>` hoisting. This works in Server Components and Client Components alike, and React deduplicates the rules.

## At build time

The compiler compiles the literal parts of `css(...)`, `styled(_, {...})` and `css={{...}}` at build time with the same code the runtime uses, so class names are identical either way. Styles with no runtime part are hoisted to module scope, so a render does no style work for them; those with a runtime part, such as a spread, still merge it on each render. With [`extract`](./extraction.md), their rules leave the JavaScript for static stylesheets.

## Debugging

- A missing style: check the element has the `k…` class, that the rule exists in `<style data-precedence="kiln">` or in the extracted CSS, and that no unlayered rule overrides it.
- To confirm the compiler ran, look in the built JavaScript for precomputed rules such as `@layer k0{.k74b6co{padding:8px 16px}}`, or, with `extract`, in the CSS. Without the compiler, only the style objects are there.
