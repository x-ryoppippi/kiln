import MagicString from 'magic-string'
import { parseSync } from 'oxc-parser'
import { compileEntry, hash, LAYER_ORDER, type Entry } from 'kiln/core'

export interface TransformOptions {
  /** Module the runtime is imported from. */
  importSource?: string
  /** Compile `css={{...}}` on host elements. */
  cssProp?: boolean
  /** Emit static rules into a CSS module instead of inserting them at runtime. */
  extract?: boolean
}

export interface TransformResult {
  code: string
  map: ReturnType<MagicString['generateMap']>
  /** Extracted CSS and the id the module imports it from, when `extract` is on. */
  css?: { id: string; code: string }
}

export const VIRTUAL_PREFIX = '/__kiln/'
const HELPER = '_kiln$'
const QUICK_FILTER = /\bcss\b|\bstyled\b/
const UNKNOWN = Symbol('unknown')

type Node = { type: string; start: number; end: number; [key: string]: any }

function unwrap(node: Node): Node {
  while (
    node.type === 'TSAsExpression' ||
    node.type === 'TSSatisfiesExpression' ||
    node.type === 'TSNonNullExpression' ||
    node.type === 'ParenthesizedExpression'
  ) {
    node = node.expression
  }
  return node
}

function staticKey(property: Node): string | null {
  if (property.type !== 'Property' || property.kind !== 'init' || property.method) return null
  const key = property.key
  if (!property.computed && key.type === 'Identifier') return key.name
  if (key.type === 'Literal' && (typeof key.value === 'string' || typeof key.value === 'number')) {
    return String(key.value)
  }
  if (key.type === 'TemplateLiteral' && key.expressions.length === 0) return key.quasis[0].value.cooked
  return null
}

/** Evaluate a node only if it is a literal style value; anything else is left to runtime. */
function staticValue(input: Node): unknown {
  const node = unwrap(input)
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string' || typeof node.value === 'number' || node.value === null
        ? node.value
        : UNKNOWN
    case 'TemplateLiteral':
      return node.expressions.length === 0 ? node.quasis[0].value.cooked : UNKNOWN
    case 'UnaryExpression':
      return node.operator === '-' && node.argument.type === 'Literal' && typeof node.argument.value === 'number'
        ? -node.argument.value
        : UNKNOWN
    case 'Identifier':
      return node.name === 'undefined' ? null : UNKNOWN
    case 'ObjectExpression': {
      const result: Record<string, unknown> = {}
      for (const property of node.properties) {
        const key = staticKey(property)
        if (key === null) return UNKNOWN
        const value = staticValue(property.value)
        if (value === UNKNOWN) return UNKNOWN
        result[key] = value
      }
      return result
    }
    default:
      return UNKNOWN
  }
}

interface CompiledObject {
  entries: Entry[]
  dynamic: string[]
}

/**
 * Split an object literal into compiled entries and source left for runtime.
 * Properties up to the last spread or computed key stay dynamic as written, since
 * they may override each other in ways only runtime knows. Later literal keys always
 * win over them, which matches how `resolve` applies compiled entries after the dynamic part.
 */
function compileObject(node: Node, code: string): CompiledObject | null {
  const properties: Node[] = node.properties
  let barrier = -1
  properties.forEach((property, index) => {
    if (property.type === 'SpreadElement' || staticKey(property) === null) barrier = index
  })

  const dynamic = properties.slice(0, barrier + 1).map((property) => code.slice(property.start, property.end))
  const after = new Map<string, { entry: Entry } | { source: string }>()

  for (const property of properties.slice(barrier + 1)) {
    const key = staticKey(property)!
    const value = staticValue(property.value)
    after.delete(key)
    after.set(
      key,
      value === UNKNOWN
        ? { source: code.slice(property.start, property.end) }
        : { entry: compileEntry(key, value) },
    )
  }

  const entries: Entry[] = []
  for (const item of after.values()) {
    if ('entry' in item) entries.push(item.entry)
    else dynamic.push(item.source)
  }
  return entries.length === 0 ? null : { entries, dynamic }
}

function walk(node: unknown, visit: (node: Node) => boolean): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (!node || typeof node !== 'object' || typeof (node as Node).type !== 'string') return
  if (visit(node as Node)) return
  for (const key in node) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'range' || key === 'loc') continue
    const child = (node as Record<string, unknown>)[key]
    if (child && typeof child === 'object') walk(child, visit)
  }
}

function langOf(id: string): 'js' | 'jsx' | 'ts' | 'tsx' {
  const extension = /\.([cm]?[jt]sx?)$/.exec(id)?.[1] ?? 'tsx'
  if (extension.endsWith('tsx')) return 'tsx'
  if (extension.endsWith('ts')) return 'ts'
  if (extension.endsWith('jsx')) return 'jsx'
  return 'jsx'
}

export function transform(code: string, id: string, options: TransformOptions = {}): TransformResult | null {
  const { importSource = 'kiln', cssProp = true, extract = false } = options
  if (!QUICK_FILTER.test(code)) return null

  const filename = id.replace(/[?#].*$/, '')
  const { program, errors } = parseSync(filename, code, { lang: langOf(filename) })
  if (errors.length > 0) return null

  const cssNames = new Set<string>()
  const styledNames = new Set<string>()
  for (const statement of program.body as Node[]) {
    if (statement.type !== 'ImportDeclaration' || statement.source.value !== importSource) continue
    for (const specifier of statement.specifiers) {
      if (specifier.type !== 'ImportSpecifier') continue
      const imported = specifier.imported.name ?? specifier.imported.value
      if (imported === 'css') cssNames.add(specifier.local.name)
      if (imported === 'styled') styledNames.add(specifier.local.name)
    }
  }
  if (!cssProp && cssNames.size === 0 && styledNames.size === 0) return null

  const s = new MagicString(code)
  const extracted = new Map<string, string>()
  let replaced = 0

  const replace = (target: Node): boolean => {
    const node = unwrap(target)
    if (node.type !== 'ObjectExpression') return false
    const result = compileObject(node, code)
    if (!result) return false

    const entries = extract
      ? result.entries.map(([key, className, rules]): Entry => {
          for (const [ruleClass, text] of rules) extracted.set(ruleClass, text)
          return [key, className, []]
        })
      : result.entries
    const dynamic = result.dynamic.length > 0 ? ',{' + result.dynamic.join(',') + '}' : ''
    s.overwrite(target.start, target.end, HELPER + '(' + JSON.stringify(entries) + dynamic + ')')
    replaced++
    return true
  }

  const visit = (node: Node): boolean => {
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
      const args: Node[] = node.arguments
      const compiledArgs = cssNames.has(node.callee.name)
        ? args
        : styledNames.has(node.callee.name)
          ? args.slice(1, 2)
          : []
      if (compiledArgs.length > 0) {
        for (const arg of args) {
          if (!compiledArgs.includes(arg) || !replace(arg)) walk(arg, visit)
        }
        return true
      }
    }
    if (
      cssProp &&
      node.type === 'JSXAttribute' &&
      node.name.type === 'JSXIdentifier' &&
      node.name.name === 'css' &&
      node.value?.type === 'JSXExpressionContainer'
    ) {
      return replace(node.value.expression)
    }
    return false
  }
  walk(program, visit)

  if (replaced === 0) return null

  let header = `import { __k as ${HELPER} } from ${JSON.stringify(importSource)};\n`
  let cssResult: TransformResult['css']
  if (extract && extracted.size > 0) {
    const cssId = VIRTUAL_PREFIX + hash(filename) + '.css'
    header += `import ${JSON.stringify(cssId)};\n`
    cssResult = { id: cssId, code: LAYER_ORDER + '\n' + [...extracted.values()].join('\n') + '\n' }
  }

  const directives = (program.body as Node[]).filter((statement) => typeof statement.directive === 'string')
  const last = directives.at(-1)
  if (last) s.appendLeft(last.end, '\n' + header)
  else s.prepend(header)

  return {
    code: s.toString(),
    map: s.generateMap({ source: filename, includeContent: true, hires: 'boundary' }),
    css: cssResult,
  }
}
