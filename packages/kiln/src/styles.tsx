import * as React from 'react'

import { LAYER_ORDER, type Rule } from './core/index.ts'

const PRECEDENCE = 'kiln'

/**
 * Inserts atomic rules through React's style hoisting, which dedupes them by `href`.
 * The layer order is emitted first so it is always the first rule React inserts for this precedence.
 */
export function Styles({ rules, nonce }: { rules: readonly Rule[]; nonce?: string }): React.ReactNode {
  if (rules.length === 0) return null
  const shared = nonce ? { nonce } : {}
  return [
    <style key="kiln-layers" href="kiln-layers" precedence={PRECEDENCE} {...shared}>
      {LAYER_ORDER}
    </style>,
    ...rules.map(([className, text]) => (
      <style key={className} href={className} precedence={PRECEDENCE} {...shared}>
        {text}
      </style>
    )),
  ]
}
