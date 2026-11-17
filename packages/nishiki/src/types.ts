import type * as React from "react";

import type { Compiled } from "./core/resolve.ts";

type Nullish = null | undefined | false;

export type CSSValue = string | number;

type CSSProperties = {
  [Key in keyof React.CSSProperties]?: React.CSSProperties[Key] | Nullish;
};

export interface CSSObject extends CSSProperties {
  [variable: `--${string}`]: CSSValue | Nullish;
  [pseudo: `:${string}`]: CSSObject | Nullish;
  // Only at-rules whose block holds style rules: @keyframes, @font-face and the like belong in a plain stylesheet.
  [media: `@media${string}`]: CSSObject | Nullish;
  [supports: `@supports${string}`]: CSSObject | Nullish;
  [container: `@container${string}`]: CSSObject | Nullish;
  [scope: `@scope${string}`]: CSSObject | Nullish;
  [startingStyle: `@starting-style${string}`]: CSSObject | Nullish;
  [layer: `@layer${string}`]: CSSObject | Nullish;
  [selector: `${string}&${string}`]: CSSObject | Nullish;
}

export type Styles = CSSObject | Compiled | Nullish | readonly Styles[];
