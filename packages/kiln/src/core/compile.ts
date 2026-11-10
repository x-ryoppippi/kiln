import { hash, l, m, resolveNestedSelector, splitSelectorList, u } from './utils.ts'

/** A single atomic rule: the class name it is keyed by and its full CSS text. */
export type Rule = readonly [className: string, text: string]

/**
 * Compiled styles for one top-level key of a style object.
 * Merging works on whole entries, so a later entry for the same key replaces an earlier one.
 */
export type Entry = readonly [key: string, className: string, rules: readonly Rule[]]

const MAX_DEPTH = 3
const LEVELS = 3

/**
 * Atomic rules are ordered by cascade layer rather than insertion order:
 * shorthands < mid-level shorthands < longhands, and every nesting level above the previous one.
 * This makes runtime-injected and build-time-extracted CSS order-independent.
 */
export const LAYER_ORDER: string =
  '@layer ' +
  Array.from({ length: (MAX_DEPTH + 1) * LEVELS }, (_, index) => 'k' + index).join(',') +
  ';'

function layerOf(key: string, depth: number): string {
  const level = l.has(key) ? 0 : m.has(key) ? 1 : 2
  return 'k' + (Math.min(depth, MAX_DEPTH) * LEVELS + level)
}

function formatSelector(className: string, selector: string): string {
  if (selector === '') return '.' + className
  if (selector.includes('&')) return selector.replaceAll('&', '.' + className)
  return splitSelectorList(selector)
    .map((part) => '.' + className + (part.startsWith(':') ? part : ' ' + part))
    .join(',')
}

function formatDeclaration(prop: string, value: string | number): string {
  const property = prop.startsWith('--')
    ? prop
    : prop.replace(/[A-Z]|^ms/g, '-$&').toLowerCase()
  const parsed =
    typeof value === 'number' && !prop.startsWith('--') && !u.test(prop)
      ? value + 'px'
      : value
  return property + ':' + parsed
}

function collect(
  prop: string,
  value: unknown,
  selector: string,
  atRules: string[],
  depth: number,
  classNames: string[],
  rules: Rule[],
): void {
  if (value === null || value === undefined || value === false) return

  if (typeof value === 'object') {
    const nested = value as Record<string, unknown>
    if (prop.startsWith('@')) {
      atRules.push(prop)
      for (const key in nested) {
        collect(key, nested[key], selector, atRules, depth + 1, classNames, rules)
      }
      atRules.pop()
    } else {
      const nestedSelector = resolveNestedSelector(prop, selector)
      for (const key in nested) {
        collect(key, nested[key], nestedSelector, atRules, depth + 1, classNames, rules)
      }
    }
    return
  }

  if (typeof value !== 'string' && typeof value !== 'number') return

  const className =
    'k' + hash(prop + ':' + value + '|' + formatSelector('&', selector) + '|' + atRules.join('|'))
  let text = formatSelector(className, selector) + '{' + formatDeclaration(prop, value) + '}'
  for (let index = atRules.length - 1; index >= 0; index--) {
    text = atRules[index] + '{' + text + '}'
  }
  text = '@layer ' + layerOf(prop, depth) + '{' + text + '}'

  classNames.push(className)
  rules.push([className, text])
}

/** Compile the value of one top-level style key into an entry. */
export function compileEntry(key: string, value: unknown): Entry {
  const classNames: string[] = []
  const rules: Rule[] = []
  collect(key, value, '', [], 0, classNames, rules)
  return [key, classNames.join(' '), rules]
}
