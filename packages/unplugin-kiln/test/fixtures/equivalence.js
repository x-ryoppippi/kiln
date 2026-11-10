import { css as style } from 'kiln'

const dynamic = { color: 'blue', margin: 4 }
const key = 'padding'
const tone = 'red'

export const cases = {
  literal: () => style({ color: 'red', padding: 8, ':hover': { color: 'blue' }, '@media (min-width: 1px)': { margin: 0 } }),
  spreadFirst: () => style({ ...dynamic, color: 'red' }),
  spreadLast: () => style({ color: 'red', ...dynamic }),
  computedFirst: () => style({ [key]: 1, padding: 2 }),
  computedLast: () => style({ padding: 2, [key]: 1 }),
  mixed: () => style({ color: tone, padding: 2, margin: dynamic.margin }),
  duplicate: () => style({ color: 'red', color: 'green' }),
  nullish: () => style({ color: null, padding: 1, margin: undefined }),
  numbers: () => style({ width: -1, lineHeight: 1.5, '--x': 2, opacity: `0.5` }),
  nestedDynamic: () => style({ padding: 1, ':hover': { color: tone } }),
  multiple: () => style({ color: 'red', margin: 1 }, { color: tone }, { margin: 2 }),
  typed: () => style({ color: 'red' }),
}
