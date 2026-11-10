import type * as React from 'react'
import * as ReactJSXDevRuntime from 'react/jsx-dev-runtime'

import { withCSS } from './jsx-runtime.ts'

export { Fragment, type JSX } from './jsx-runtime.ts'

export function jsxDEV(
  type: React.ElementType,
  props: Record<string, any>,
  key: React.Key | undefined,
  isStatic: boolean,
  source?: unknown,
  self?: unknown,
): React.ReactElement {
  return withCSS(
    (innerType, innerProps, innerKey) =>
      ReactJSXDevRuntime.jsxDEV(innerType, innerProps, innerKey, isStatic, source as any, self),
    type,
    props,
    key,
  )
}
