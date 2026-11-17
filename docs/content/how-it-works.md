---
title: How it works
description: Atomic rules, hashed class names, ranked conditions and cascade layers.
---

# How it works

## Atomic rules

Each top-level key of a style object compiles to an entry of atomic rules. A rule's class name hashes the property, the value as written, the normalised selector, the at-rules and the layer, so the same input always gets the same class (`margin: 8` and `margin: "8px"` produce the same CSS under different classes), whether the runtime or the compiler produced it.

## Class names

A class name is `n` and a 32-bit hash ([djb2](http://www.cse.yorku.ca/~oz/hash.html)) of the rule's input in base 36, such as `ncpuxwg`. The runtime and the compiler use the same function, so a rule compiled at build time and the same rule formatted at runtime share one class, and React inserts it once.

Two different rules can hash alike, and a page would then get only one of them. The compiler checks every rule it compiles against every other in the build, extracted or not, and fails with an error that names both rules and their modules; writing one value another way that means the same, such as with other units, gives it another name. Rules the runtime formats for [runtime values](#runtime-values) that keep a rule each are never seen by a build, so nothing checks them.

The hash keeps 32 bits because shorter ones collide too often for what they save. Among `n` distinct rules the chance of any collision is about n² / 2³³: 0.02% for the 1,291 rules of the benchmark's 32-route app and 1.2% for 10,000, against 0.3% and 17% with 28 bits. Compiled modules without `extract` ship what each rule is made from rather than its class name, so a shorter hash saves nothing there, and with `extract` 28 bits would save only 3.8 KiB gzipped of the 32-route app's 177 KiB.

With `extract`, a client build that plans its stylesheets can instead name its rules itself, `_` and as few base-36 digits as the build needs, with [`classNames: "compact"`](./extraction.md#compact-class-names). Those names belong to the build, so only an app whose markup no other build renders can use them.

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

Every rule sits inside one top-level layer, `nishiki`. A rule's rank is its layer there: `nishiki.n0` for no condition, and up from there. A broader property sits in nested layers inside it (`nishiki.n0.a.a.a` for `padding`), since a layer's own rules win over its sublayers.

```css
@layer nishiki {
  @layer n0, n1t;
}
@layer nishiki.n0.a.a.a {
  .ne962m0 {
    padding: 8px 16px;
  }
}
@layer nishiki.n0 {
  .n1fxj9np {
    color: white;
  }
}
@layer nishiki.n1t.a.a {
  .n127hgyq:hover {
    background: #1158c7;
  }
}
```

The runtime inserts the order of every layer inside `nishiki`, `layerOrder()`, once, ahead of its rules, and React hoists it to the start of the head. Extracted CSS declares only the layers the build uses, in the same relative order. A planned sheet that may load first declares all of them, and one that always loads after such a sheet leaves the statement out; the stylesheets of one chunk group load in no set order, so each of them that may load first declares it. A CSS module per source module declares the layers up to the highest it uses, which any other module's statement extends consistently.

Rules the runtime inserts land between extracted rules by rank as long as its statement precedes the extracted one in the document. React's hoisting sees to that: the styles go at the start of the head, or, when rendered on the server, in the head before any other stylesheet. If you render the app into a template whose head links extracted stylesheets before React's output, render `<style>{layerOrder()}</style>` at the top of the head; otherwise a runtime rule in a layer that no extracted sheet uses ranks above every extracted rule.

### Your own layers

Since all of nishiki's layers sit inside `nishiki`, the page orders them against its own layers by that one name, and a layer of the page's ranks above or below every nishiki rule, never between them. Like any layer, `nishiki` takes its place among the top-level layers where the page first names it: its first stylesheet, or its runtime statement, which React hoists to the start of the head. A layer the page names later, such as a reset's `@layer reset { … }`, beats every nishiki rule, and so does unlayered CSS.

For nishiki to win over a reset or vendor layer, declare the order before any of nishiki's styles:

```css
@layer reset, nishiki;
```

Put it at the top of the head of an HTML template, or first in a stylesheet that the page links before nishiki's. Where React renders the head, render it as a style with a precedence of its own ahead of anything that uses nishiki, such as in the root layout, so React inserts it before nishiki's styles:

```tsx
<style href="layer-order" precedence="layer-order">
  {"@layer reset, nishiki;"}
</style>
```

Do not raise specificity or use `!important` to fight nishiki's rules; rank the condition instead.

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

The compiler compiles the literal parts of `css(...)`, `styled(_, {...})` and `css={{...}}` at build time with the same code the runtime uses, so class names are identical either way. A non-literal value of a property, such as `{ color: active ? "red" : "gray" }`, is ranked at build time and, where its style reaches an element, read from a custom property the element sets ([Runtime values](#runtime-values)). Styles with no runtime part are hoisted to module scope, so a render does no style work for them; those with a runtime part, such as a spread, still merge it on each render.

Ranking is the only part of a rule that needs the compiler, so the JavaScript carries what each rule is made from rather than the rule itself: its value and its layer, plus its property, selector and at-rules where they differ from the key. `{ padding: "8px 16px", ":hover": { color: "red" } }` ships as `[["padding",["8px 16px","n0.a.a.a"]],[":hover",["red","n1t","color",":hover"]]]`. When the module loads, the lean runtime formats each rule and hashes its class name with the same function the compiler uses. A rule's text repeats its class name and its layer, and class names are hashes that gzip cannot compress, so the inputs are much smaller than the rules. With [`extract`](./extraction.md), the rules leave the JavaScript for static stylesheets, and an entry keeps its key, which the runtime still merges by, and its class names; styles that need no merging at runtime keep only their class names.

In client builds, compiled modules load `@nishikijs/react/lean`, which leaves out the compiler that ranks conditions at runtime. The compiler writes this into each module it compiles rather than leaving it to the bundler's resolver, so it works the same with every bundler, Next.js with Turbopack and Bun included: it points the module's imports of `@nishikijs/react`, `@nishikijs/react/jsx-runtime` and `@nishikijs/react/jsx-dev-runtime` at their counterparts under `@nishikijs/react/lean`, and, with the `css` prop on, starts the module with a `/** @jsxImportSource @nishikijs/react/lean */` pragma, so the JSX transform that runs after it imports the lean JSX runtime. A compiled module in which no element can take a `css` prop any more, with none left in place and no JSX spread, starts with `/** @jsxImportSource react */` instead, since nishiki's JSX runtime would only hand each of its elements on to React's. A module's own `@jsxImportSource` pragma for nishiki gives way to the one the compiler writes; one for another source stays. Some JSX transforms ignore the pragma, such as Farm's React plugin; where the bundler lets the compiler resolve imports, it points the JSX runtime import of a compiled module at the lean one as well. A module that still hands the runtime a style object to compile, such as a spread, a selector or at-rule key with a non-literal value, or a style the compiler cannot read before runtime, such as a prop, a call or a member, imports `@nishikijs/react/compiler` to load it; [Runtime fallbacks](./compiler.md#runtime-fallbacks) lists these constructs and how to have the build report them.

Vite's dev server, server builds and unloader keep the full entries. A server build is a Vite server environment, a webpack or Rspack compiler that does not target the web, a Bun build that does not target the browser, an esbuild or Rolldown build with `platform: "node"`, or a Farm build with a Node `targetEnv`.

The compiler compiles no dependency, so a dependency that imports nishiki's entries, such as one built with nishiki as its JSX import source, is left to the bundler's resolver. When its source mentions `css` or `styled`, it may hand the runtime a style object to compile, so it keeps the full entries. When it mentions neither, the compiler resolves its imports of nishiki's entries to the lean ones, except under Bun and Turbopack, which give the compiler no resolver, so there every such dependency keeps the full entries.

### Runtime values

A non-literal value of a CSS property whose style the compiler knows reaches an element compiles to one static rule per property, which reads a custom property, and the element sets that custom property inline. `css={{ color: tone }}` on a `<p>` renders as:

```html
<p class="nntdtaq" style="--n-color:tomato"></p>
```

```css
@layer nishiki.n0 {
  .nntdtaq {
    color: var(--n-color);
  }
}
```

The rule sits in the layer the property's own rule would, so it ranks against the element's other rules as before. It is an ordinary compiled rule, extracted with `extract` and renamed with compact class names, and it is the same whatever values the property takes, so the CSS no longer grows with every value and a render only builds the inline style.

- **Where.** A `css` prop on a host element such as `<div>`; the styles of a `styled` component whose element is a tag, `styled("a", …)`, or a styled component defined at the top of the same module that renders one, wrapped any number of times; and a `css` prop on such a component.
- **Elsewhere,** a runtime value keeps a rule of its own, formatted at runtime from what the build derived from its key: in a `css()` call, whose class names may go anywhere; on a component the compiler cannot see render an element, which may drop a `style` prop; and in a module-level constant compiled in place, which any of these may read. A runtime value under a selector or at-rule key, such as `{ ":hover": { color: tone } }`, and a value that turns out to be an object at runtime, are still compiled by the [runtime compiler](./compiler.md#runtime-fallbacks).
- **Merging.** Inputs still merge per top-level key, the later winning, whichever of them is a literal and whichever a runtime value, across a `styled` component, the components it wraps and the `css` prop. A runtime value of `null`, `undefined`, `false` or `true` still unsets the key.
- **The element's own `style`.** nishiki adds its custom properties under it, so a key the element sets itself wins, and its own declarations keep beating every rule, as an inline style always did.
- **Inheritance.** The element takes the class only where it sets a value of its own. Custom properties inherit, so a class it always took would read its parent's value where the runtime sets nothing; a fallback in `var()` cannot stand in for that, since the parent's value is not missing on the child. An empty string sets nothing on an ordinary property, whose rule it made invalid, and declares an empty value of a custom property, which nishiki writes as a space because React leaves an empty value out of a style.
- **Units.** Whether a number takes `px` follows from the property, so the build decides it, with the same unitless properties as everywhere else, and the runtime only checks that the value is a number.
- **What changes.** A value that is invalid for its property is invalid only once `var()` is substituted, so the property computes as unset instead of falling back to a lower declaration of it, and `!important` in a runtime value no longer reaches the declaration. Neither is ordered by nishiki's layers.

## Debugging

- A missing style: check the element has the `n…` class (`_…` with `classNames: "compact"`), that the rule exists in `<style data-precedence="nishiki">` or in the extracted CSS, and that no unlayered rule overrides it. For a runtime value set as a custom property, check the element's `style` sets the `--n-…` property its rule reads.
- A style that wins or loses depending on navigation: look for an unranked-condition warning, or two rules for the property in the same `@layer`.
- To confirm the compiler ran, look in the built JavaScript for compiled entries such as `["padding",["8px 16px","n0.a.a.a"]]`, which carry each rule's layer, or, with `extract`, for `n…` class names and the rules in the CSS. Without the compiler, only the style objects are there.
