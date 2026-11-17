import type * as React from "react";

import type { Compiled } from "./core/resolve.ts";

type Nullish = null | undefined | false;

export type CSSValue = string | number;

type CSSProperties = {
  [Key in keyof React.CSSProperties]?: React.CSSProperties[Key] | Nullish;
};

// The name must end where the compiler's `@name(?![\w-])` does: `@mediabogus` is not `@media`.
type AtRuleKey<Name extends string> = `${Name} ${string}` | `${Name}(${string}`;

export interface CSSObject extends CSSProperties {
  [variable: `--${string}`]: CSSValue | Nullish;
  [pseudo: `:${string}`]: CSSObject | Nullish;
  // Only at-rules whose block holds style rules: @keyframes, @font-face and the like belong in a plain stylesheet.
  [media: AtRuleKey<"@media">]: CSSObject | Nullish;
  [supports: AtRuleKey<"@supports">]: CSSObject | Nullish;
  [container: AtRuleKey<"@container">]: CSSObject | Nullish;
  [scope: AtRuleKey<"@scope">]: CSSObject | Nullish;
  [startingStyle: AtRuleKey<"@starting-style">]: CSSObject | Nullish;
  [layer: AtRuleKey<"@layer">]: CSSObject | Nullish;
  "@starting-style"?: CSSObject | Nullish;
  "@layer"?: CSSObject | Nullish;
  [selector: `${string}&${string}`]: CSSObject | Nullish;
}

export type Styles = CSSObject | Compiled | Nullish | readonly Styles[];
