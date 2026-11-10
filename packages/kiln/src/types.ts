import type * as React from 'react'

import type { Compiled } from './core/index.ts'

type Nullish = null | undefined | false

export type CSSValue = string | number

type CSSProperties = {
  [Key in keyof React.CSSProperties]?: React.CSSProperties[Key] | Nullish
}

export interface CSSObject extends CSSProperties {
  [variable: `--${string}`]: CSSValue | Nullish
  [pseudo: `:${string}`]: CSSObject | Nullish
  [atRule: `@${string}`]: CSSObject | Nullish
  [selector: `${string}&${string}`]: CSSObject | Nullish
}

export type Styles = CSSObject | Compiled | Nullish
