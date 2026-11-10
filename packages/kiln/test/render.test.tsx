/** @jsxImportSource kiln */
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { css, LAYER_ORDER, styled } from 'kiln'

const html = (node: React.ReactNode) =>
  renderToString(
    <html>
      <head />
      <body>{node}</body>
    </html>,
  )

describe('rendering', () => {
  it('hoists rules for the css prop into one precedence group, layer order first', () => {
    const output = html(<div css={{ color: 'red', padding: 8 }}>hi</div>)
    const [className] = css({ color: 'red', padding: 8 })
    expect(output).toContain(`class="${className}"`)
    expect(output).toMatch(/<style data-precedence="kiln"[^>]*>@layer k0,/)
    expect(output.indexOf(LAYER_ORDER)).toBeLessThan(output.indexOf('{color:red}'))
  })

  it('merges styled base styles with the css prop per key', () => {
    const Button = styled('button', { color: 'red', padding: 8 })
    const output = html(<Button css={{ color: 'blue' }}>go</Button>)
    const [className] = css({ color: 'blue', padding: 8 })
    const rendered = /<button class="([^"]*)"/.exec(output)?.[1] ?? ''
    expect(new Set(rendered.split(' '))).toEqual(new Set(className.split(' ')))
    expect(output).not.toContain('color:red')
  })

  it('keeps style props from reaching the element', () => {
    const Box = styled('div', ({ tone }: { tone: 'warm' | 'cool' }) => ({ color: tone === 'warm' ? 'red' : 'blue' }))
    const output = html(<Box tone="cool" />)
    expect(output).toContain('color:blue')
    expect(output).not.toContain('tone=')
  })
})
