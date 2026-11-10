/** @jsxImportSource kiln */
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vite-plus/test'

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

  it('merges a styled component wrapping another per key', () => {
    const Base = styled('button', { color: 'red', padding: 8 })
    const Blue = styled(Base, { color: 'blue' })
    const output = html(<Blue css={{ margin: 0 }} />)
    const [className] = css({ color: 'blue', padding: 8, margin: 0 })
    const rendered = /<button class="([^"]*)"/.exec(output)?.[1] ?? ''
    expect(new Set(rendered.split(' '))).toEqual(new Set(className.split(' ')))
    expect(output).not.toContain('color:red')
  })

  it('keeps style props of every layer from reaching the element', () => {
    const Base = styled('div', ({ size }: { size: number }) => ({ padding: size }))
    const Toned = styled(Base, ({ tone }: { tone: string }) => ({ color: tone }))
    const output = html(<Toned tone="red" size={4} />)
    expect(output).toContain('color:red')
    expect(output).toContain('padding:4px')
    expect(output).not.toMatch(/tone=|size=/)
  })
})
