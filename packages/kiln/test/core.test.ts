import { describe, expect, it } from 'vite-plus/test'

import { compileEntry, compiled, LAYER_ORDER, resolve } from '../src/core/index.ts'

const rulesOf = (key: string, value: unknown) => compileEntry(key, value)[2].map(([, text]) => text)

describe('compileEntry', () => {
  it('compiles a declaration into an atomic rule in the longhand layer', () => {
    const [key, className, rules] = compileEntry('color', 'red')
    expect(key).toBe('color')
    expect(className).toMatch(/^k[0-9a-z]+$/)
    expect(rules).toEqual([[className, `@layer k2{.${className}{color:red}}`]])
  })

  it('layers shorthands below mid-level shorthands below longhands', () => {
    expect(rulesOf('margin', 0)[0]).toMatch(/^@layer k0\{/)
    expect(rulesOf('borderTop', '1px solid')[0]).toMatch(/^@layer k1\{/)
    expect(rulesOf('marginTop', 0)[0]).toMatch(/^@layer k2\{/)
  })

  it('adds px only where the property takes a length', () => {
    expect(rulesOf('padding', 8)[0]).toContain('{padding:8px}')
    expect(rulesOf('lineHeight', 1.5)[0]).toContain('{line-height:1.5}')
    expect(rulesOf('--gap', 4)[0]).toContain('{--gap:4}')
  })

  it('places nested selectors and at-rules in deeper layers', () => {
    const [, className, rules] = compileEntry(':hover', { color: 'blue' })
    expect(rules[0]![1]).toBe(`@layer k5{.${className}:hover{color:blue}}`)

    const [, mediaClass, mediaRules] = compileEntry('@media (min-width: 600px)', { '&:focus': { margin: 0 } })
    expect(mediaRules[0]![1]).toBe(`@layer k6{@media (min-width: 600px){.${mediaClass}:focus{margin:0px}}}`)
  })

  it('skips nullish values', () => {
    expect(compileEntry('color', null)).toEqual(['color', '', []])
  })

  it('declares every layer it can emit', () => {
    expect(LAYER_ORDER).toBe('@layer k0,k1,k2,k3,k4,k5,k6,k7,k8,k9,k10,k11;')
  })
})

describe('resolve', () => {
  const classOf = (input: Parameters<typeof resolve>[0]) => new Set(resolve(input)[0].split(' '))

  it('merges per top-level key with later inputs winning', () => {
    expect(classOf([{ color: 'red' }, { color: 'blue' }])).toEqual(classOf([{ color: 'blue' }]))
  })

  it('lets null unset an earlier key', () => {
    expect(classOf([{ color: 'red', margin: 0 }, { color: null }])).toEqual(classOf([{ margin: 0 }]))
  })

  it('applies compiled entries over their dynamic part', () => {
    const input = compiled([compileEntry('color', 'red')], { color: 'blue', margin: 0 })
    expect(classOf([input])).toEqual(classOf([{ margin: 0, color: 'red' }]))
  })

  it('dedupes rules shared between keys', () => {
    const [, rules] = resolve([{ ':hover': { color: 'red' } }, { '&:hover': { color: 'red' } }])
    expect(rules).toHaveLength(1)
  })

  it('flattens nested lists in order', () => {
    expect(classOf([[{ color: 'red' }, [{ color: 'blue', margin: 0 }]], { margin: 1 }])).toEqual(
      classOf([{ color: 'blue', margin: 1 }]),
    )
  })
})
