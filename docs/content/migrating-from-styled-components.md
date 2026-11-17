---
title: Migrating from styled-components
description: How styled-components concepts map to nishiki, a step-by-step plan and a before-and-after example, with a short section on Emotion.
---

# Migrating from styled-components

nishiki keeps the parts of styled-components that made it pleasant, `styled()`, `$` props and styles next to the component, and changes what happens underneath: styles are objects rather than template strings, every declaration is an atomic rule, and overrides are decided by [cascade layers](./how-it-works.md#what-wins) rather than by the order rules reach the document. This page maps styled-components 6 to nishiki, then sets out a plan and a worked example. [Emotion](#emotion) is covered at the end.

## Package and JSX setup

```diff
- npm install styled-components
+ npm install @nishikijs/react
```

```diff
  // tsconfig.json
+ "jsxImportSource": "@nishikijs/react"
```

Set the same import source in your bundler's React or JSX transform; [Bundler setup](./compiler.md) shows where for each one. The import source is what gives host elements a `css` prop. nishiki needs React 19 and Node.js 24 or later.

## Concepts at a glance

| styled-components                                | nishiki                                                                                      |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `` styled.div`…` ``, `styled.div({ … })`         | `styled("div", { … })`                                                                       |
| `` styled(Component)`…` ``                       | `styled(Component, { … })`                                                                   |
| Tagged template CSS                              | Style objects: camelCase properties, nested selector and at-rule keys                        |
| Interpolations `${(p) => …}`                     | One resolver function, `(styleProps, props) => styles`                                       |
| Transient props `$prop`                          | `$prop`, the same convention                                                                 |
| `shouldForwardProp`                              | Not needed: `$` props never reach the element, every other prop does                         |
| `css` helper for fragments                       | A plain style object, composed in a list: `[base, other]`                                    |
| `.attrs()`                                       | A component that sets the attributes, wrapped with `styled` ([idiom](#attrs))                |
| `as` / `forwardedAs`                             | Not supported; one `styled` per element ([idiom](#the-as-prop))                              |
| `ThemeProvider`, `useTheme`                      | CSS custom properties ([theming](#theming))                                                  |
| `createGlobalStyle`                              | A plain stylesheet, in a cascade layer                                                       |
| `keyframes`                                      | `@keyframes` in a plain stylesheet, referenced by name                                       |
| `ServerStyleSheet`, the Next.js registry         | Nothing: React 19 hoists the rules ([SSR and Server Components](#ssr-and-server-components)) |
| `babel-plugin-styled-components`, the SWC plugin | The optional [nishiki compiler](./compiler.md)                                               |
| `&&` and `!important` to win                     | Not needed: later inputs win per key, conditions are ranked ([overrides](#overrides))        |
| Component selectors `${Icon}`                    | A descendant selector such as `"& [data-icon]"`                                              |

## Templates become objects

Each declaration becomes a camelCase key, nested blocks become keys of their own, and numbers get `px` unless the property is unitless:

```diff
- const Card = styled.section`
-   padding: 16px;
-   border-radius: 8px;
-   &:hover { box-shadow: 0 1px 3px rgb(0 0 0 / 0.2); }
-   & > h2 { margin: 0; }
-   @media (max-width: 40rem) { padding: 8px; }
- `;
+ const Card = styled("section", {
+   padding: 16,
+   borderRadius: 8,
+   ":hover": { boxShadow: "0 1px 3px rgb(0 0 0 / 0.2)" },
+   "& > h2": { margin: 0 },
+   "@media (max-width: 40rem)": { padding: 8 },
+ });
```

`"&:hover"` and `":hover"` are the same key. [Style objects](./styling.md#style-objects) lists every kind of key.

## Interpolations become a resolver

Instead of a function per value, `styled` takes one function that returns the whole style. Its first argument holds the `$` props and its second the other props:

```diff
- const Button = styled.button<{ $size: "sm" | "lg" }>`
-   padding: ${({ $size }) => ($size === "sm" ? "4px 8px" : "8px 16px")};
-   opacity: ${({ disabled }) => (disabled ? 0.5 : 1)};
- `;
+ const Button = styled("button", ({ $size }: { $size: "sm" | "lg" }, { disabled }) => ({
+   padding: $size === "sm" ? "4px 8px" : "8px 16px",
+   opacity: disabled ? 0.5 : 1,
+ }));
```

`$` props work as transient props do: they reach the resolver and never the element. Every other prop is forwarded, so there is no `shouldForwardProp`; rename a style-only prop with a `$` instead. When a `styled` component wraps another, the `$` props reach the inner one's resolver too.

## The `css` helper

A reusable fragment is a plain object, and fragments compose as a list in which later entries win per key:

```diff
- const truncate = css`
-   overflow: hidden;
-   text-overflow: ellipsis;
-   white-space: nowrap;
- `;
- const Title = styled.h2`
-   ${truncate}
-   font-size: 20px;
- `;
+ const truncate = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
+ const Title = styled("h2", [truncate, { fontSize: 20 }]);
```

The same list works in the `css` prop: `css={[truncate, isActive && { color: "red" }]}`. Prefer a list to a spread; a spread is left to the runtime compiler, while the [compiler](./compiler.md#runtime-fallbacks) compiles each object of a list. It compiles a fragment in place when it is a `const` in the same module that is not exported, so a fragment imported from another module still works but its styles are compiled at runtime.

nishiki also exports a function named `css`, but it is not a fragment helper: `css(...styles)` returns a class name and a `Styles` component, for elements you cannot give a `css` prop. See [`css()`](./styling.md#css).

## `attrs`

There is no `attrs`. Write the attributes into a component and wrap it with `styled`:

```diff
- const PasswordInput = styled.input.attrs({ type: "password", autoComplete: "current-password" })`
-   padding: 8px;
- `;
+ const PasswordInput = styled(
+   (props: ComponentProps<"input">) => <input type="password" autoComplete="current-password" {...props} />,
+   { padding: 8 },
+ );
```

Put `{...props}` after the defaults to let callers override them, or before them to fix them. Wrapping the inner component with `styled`, rather than rendering a styled component inside a plain function, keeps `PasswordInput` a styled component, so wrapping it again merges styles instead of joining class names. Attributes computed from props are ordinary JavaScript in that component.

## The `as` prop

`as` and `forwardedAs` are not supported: a prop named `as` is forwarded to the element like any other. Define one styled component per element and share the style object:

```tsx
import { styled } from "@nishikijs/react";
import { Link } from "./router";

const button = { padding: "8px 16px", borderRadius: 6 };

export const Button = styled("button", button);
export const ButtonLink = styled(Link, button);
```

`styled` passes `className` to a component it wraps, as styled-components does, and `style` where a [runtime value](./how-it-works.md#runtime-values) sets a custom property, so the component should pass both to its element. React 19 passes `ref` as a prop, so it reaches the element without `forwardRef`.

## Theming

`ThemeProvider` relies on React context, which Server Components do not have. Put theme values in CSS custom properties and refer to them with `var()`:

```css
/* theme.css */
:root {
  --color-accent: #0969da;
  --color-accent-hover: #0550ae;
}

[data-theme="dark"] {
  --color-accent: #4493f8;
  --color-accent-hover: #6cb6ff;
}
```

```diff
- background: ${({ theme }) => theme.colors.accent};
+ background: "var(--color-accent)",
```

Switching themes is then a matter of an attribute or class on an ancestor, and needs no re-render of the styled components. A subtree can set its own values with the `css` prop, such as `css={{ "--color-accent": "rebeccapurple" }}`; custom properties pass through untouched.

The compiler only compiles values written as literals in place, so `"var(--color-accent)"` is compiled while `theme.colors.accent` imported from a module stays a [runtime value](./how-it-works.md#runtime-values). If you want typed names, an object of `var()` strings works but costs that; values JavaScript needs, such as for a chart, can still come from a module or your own context in Client Components.

## Global styles and keyframes

`createGlobalStyle` and `keyframes` have no counterpart. Write global styles and `@keyframes` in a plain stylesheet and refer to keyframes by name, such as `animation: "spin 1s linear infinite"`. A style object cannot hold `@keyframes`, `@font-face` or any other at-rule that holds no style rules; see [Style objects](./styling.md#style-objects). Keyframe names are global, so pick ones that do not clash.

Unlayered CSS beats every nishiki rule, whatever its specificity, so a global `button { padding: 0 }` would override `styled("button", { padding: 8 })`. Put global styles in a layer and declare the order before nishiki's styles load:

```css
@layer reset, nishiki;

@layer reset {
  button {
    padding: 0;
  }
}
```

[Your own layers](./how-it-works.md#your-own-layers) shows where to declare the order when React renders the head.

## SSR and Server Components

nishiki renders its rules as React 19 `<style href precedence>` elements, which React hoists into the head during server rendering and streaming, and deduplicates. There is nothing to collect: remove `ServerStyleSheet`, `collectStyles` and `getStyleElement`, the style registry built on `useServerInsertedHTML` in the Next.js App Router, and `StyleSheetManager`. `styled`, the `css` prop and `css()` work in Server Components without `'use client'`.

`StyleSheetManager` options have no counterpart: nishiki adds no vendor prefixes and runs no stylis plugins. For a nonce under a Content Security Policy, see [`css()` takes several inputs](./migrating-from-restyle.md#css-takes-several-inputs).

With [`extract`](./extraction.md), most rules move to static stylesheets that the bundler or framework links. If an HTML template links them ahead of React's output, render `<style>{layerOrder()}</style>` at the top of the head; see [Cascade layers](./how-it-works.md#cascade-layers).

## The compiler instead of the Babel or SWC plugin

`babel-plugin-styled-components` and its SWC port, `compiler.styledComponents` in Next.js, add display names and stable component IDs and minify the template CSS. Remove them. nishiki's [compiler](./compiler.md) is optional, and does something else: it compiles literal styles at build time with the same code the runtime uses, hoists fully static styles out of render, loads a leaner runtime in client builds and, with `extract`, moves the rules to stylesheets split per route. Without it, everything still works at runtime.

Set the plugin's `runtime` option to `"warn"` to have the build name each style it leaves to the runtime compiler, such as a spread or a style imported from another module; [Runtime fallbacks](./compiler.md#runtime-fallbacks) lists them.

## Overrides

styled-components gives each style block one class. Extending a component or passing it a `className` adds a second class, and the two compete in the stylesheet by specificity and then by the order the rules were inserted, which is why `&&` and `!important` turn up. nishiki works differently:

- **Later input wins per key.** `styled(Base, overrides)` and `<Base css={overrides} />` merge into `Base`'s styles per top-level key, so the override always wins, and replaces the rules it overrides instead of adding rules. An override replaces the whole key: overriding `":hover"` replaces every declaration under it.
- **Conditions are ranked.** A rule under a higher-ranked condition wins whatever the source order: `:hover` beats a media query, a wider `min-width` beats a narrower one. In styled-components, specificity and then source order decided, so of two media queries the one later in the template won. See [Conditions](./how-it-works.md#conditions).
- **Breakpoints come from a ladder.** Width queries rank by the configured breakpoints, Tailwind's `40rem` to `96rem` by default. A width that is not on the ladder, such as `(max-width: 600px)`, warns and falls back to source order; use the ladder's widths or [configure your own](./how-it-works.md#conditions).
- **Narrower properties win.** `paddingLeft` beats `padding` whatever order they are written in, where in a template the later declaration wins, so `{ paddingLeft: 8, padding: 0 }` keeps the left padding.
- **No specificity hacks.** Drop `&&`, `&&&` and `!important`. `!important` reverses layer precedence and warns. To override, pass `css` or wrap with `styled`; never pass one styled component's class names into another's `className`.

[What wins](./how-it-works.md#what-wins) gives the full rules, and [Not ordered by layer](./how-it-works.md#not-ordered-by-layer) the cases where order still decides.

## Migration plan

1. **Install nishiki and set the JSX import source** in `tsconfig.json` and the bundler, alongside styled-components. Both can run side by side while you convert. If you use styled-components' `css` prop through its Babel plugin, convert those uses first, since both libraries claim the prop.
2. **Move theme values to custom properties** in a stylesheet, and keep `ThemeProvider` until no styled-components component reads it.
3. **Move global styles and keyframes** to plain stylesheets, in a layer below nishiki's: `@layer reset, nishiki;`.
4. **Convert components, base components first.** styled-components rules are unlayered, so they beat nishiki's on the same element: a nishiki component that wraps or overrides a styled-components one would lose. Convert a component no later than the ones that extend it. Turn templates into objects, interpolations into a resolver, `attrs` and `as` into the idioms above, and drop `&&`.
5. **Remove the SSR plumbing and the plugin**: `ServerStyleSheet`, the Next.js registry, `StyleSheetManager`, and `babel-plugin-styled-components` or `compiler.styledComponents`.
6. **Add the compiler** for your bundler, with `runtime: "warn"` to find styles left to runtime, and `extract` once everything renders as before.
7. **Remove `ThemeProvider` and `styled-components`.**

## Before and after

```tsx
// Before
import styled, { css } from "styled-components";

const focusRing = css`
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.accent};
    outline-offset: 2px;
  }
`;

export const Button = styled.button.attrs({ type: "button" })<{ $variant?: "primary" | "ghost" }>`
  padding: 8px 16px;
  border: 0;
  border-radius: 6px;
  font-weight: 600;
  color: ${({ $variant, theme }) => ($variant === "ghost" ? theme.colors.accent : "white")};
  background: ${({ $variant, theme }) => ($variant === "ghost" ? "transparent" : theme.colors.accent)};
  ${focusRing}

  &:hover {
    background: ${({ $variant, theme }) =>
      $variant === "ghost" ? theme.colors.accentSubtle : theme.colors.accentHover};
  }

  @media (max-width: 40rem) {
    width: 100%;
  }
`;

export const DangerButton = styled(Button)`
  && {
    background: crimson;
  }
`;
```

```tsx
// After
import { styled } from "@nishikijs/react";
import type { ComponentProps } from "react";

const focusRing = { ":focus-visible": { outline: "2px solid var(--color-accent)", outlineOffset: 2 } };

export const Button = styled(
  (props: ComponentProps<"button">) => <button type="button" {...props} />,
  ({ $variant = "primary" }: { $variant?: "primary" | "ghost" }) => [
    {
      padding: "8px 16px",
      border: 0,
      borderRadius: 6,
      fontWeight: 600,
      "@media (max-width: 40rem)": { width: "100%" },
    },
    focusRing,
    $variant === "ghost"
      ? {
          color: "var(--color-accent)",
          background: "transparent",
          ":hover": { background: "var(--color-accent-subtle)" },
        }
      : { color: "white", background: "var(--color-accent)", ":hover": { background: "var(--color-accent-hover)" } },
  ],
);

export const DangerButton = styled(Button, { background: "crimson", ":hover": { background: "darkred" } });
```

What changed:

- The theme is CSS custom properties, so `Button` needs no provider and works in Server Components.
- The variants are whole objects chosen with `?:` rather than a value per property, so every style is a literal and the compiler compiles all of it, the `:hover` values included. A runtime value under a selector key such as `":hover"` would be left to the runtime compiler.
- `DangerButton` overrides `background` without `&&`, and overrides `":hover"` too: its own `background` would otherwise lose to `Button`'s hover background, since `:hover` ranks above no condition.

## Emotion

Most of the above applies to Emotion as well, and its object styles carry over almost unchanged, since they use the same camelCase keys:

- **JSX:** replace `jsxImportSource: "@emotion/react"`, or the `@emotion/babel-preset-css-prop` preset, with `@nishikijs/react`. The `css` prop takes objects and lists as in Emotion, later entries winning; string styles become objects.
- **`@emotion/styled`:** `styled.div(styles)` and `styled("div")(styles)` become `styled("div", styles)`, and a function of props becomes a resolver. Replace `shouldForwardProp` with `$` props.
- **`css` from `@emotion/react`:** a plain object. **`cx` and `ClassNames`:** pass every input to one [`css()`](./styling.md#css) call, which returns the class name; joining class names from separate calls does not merge them.
- **`Global` and `keyframes`:** plain stylesheets, [as above](#global-styles-and-keyframes). **`ThemeProvider` and `useTheme`:** [custom properties](#theming).
- **SSR:** remove `CacheProvider`, `createCache`, `@emotion/server` and `extractCritical`; nothing needs collecting, and no `'use client'` is needed in the App Router.
- **`@emotion/babel-plugin` and the SWC plugin:** remove them, and add nishiki's [compiler](./compiler.md) if you want build-time compilation. Component selectors, which need the plugin, become descendant selectors such as `"& [data-icon]"`.
