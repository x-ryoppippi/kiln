import * as React from 'react'

import { resolve } from './core/index.ts'
import { Styles } from './styles.tsx'
import type { Styles as StyleInput } from './types.ts'

/**
 * Generate atomic class names from style objects, later arguments winning per top-level key.
 * @returns The class names and a component that renders the rules they need.
 */
export function css(...styles: StyleInput[]): [className: string, Styles: () => React.ReactNode] {
  const [className, rules] = resolve(styles)
  return [className, () => React.createElement(Styles, { rules })]
}
