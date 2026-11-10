import { compileEntry, type Entry, type Rule } from './compile.ts'

const COMPILED = '$$kiln'

/** Styles pre-compiled by the build plugin, optionally with a part left for runtime. */
export interface Compiled {
  readonly [COMPILED]: readonly Entry[]
  readonly d?: Record<string, unknown>
}

/** Create compiled styles. Emitted by the build plugin; not meant to be written by hand. */
export function compiled(entries: readonly Entry[], dynamic?: Record<string, unknown>): Compiled {
  return dynamic ? { [COMPILED]: entries, d: dynamic } : { [COMPILED]: entries }
}

export type StyleInput = object | null | undefined | false

function isCompiled(input: object): input is Compiled {
  return COMPILED in input
}

function addRaw(entries: Map<string, Entry>, styles: Record<string, unknown>): void {
  for (const key in styles) {
    entries.set(key, compileEntry(key, styles[key]))
  }
}

/**
 * Merge style inputs per top-level key, later inputs winning, and return the
 * class names with the rules that still need to be inserted at runtime.
 */
export function resolve(inputs: readonly StyleInput[]): [className: string, rules: Rule[]] {
  const entries = new Map<string, Entry>()

  for (const input of inputs) {
    if (!input) continue
    if (isCompiled(input)) {
      if (input.d) addRaw(entries, input.d)
      for (const entry of input[COMPILED]) entries.set(entry[0], entry)
    } else {
      addRaw(entries, input as Record<string, unknown>)
    }
  }

  let className = ''
  const rules: Rule[] = []
  const seen = new Set<string>()
  for (const [, entryClassName, entryRules] of entries.values()) {
    if (entryClassName) className = className ? className + ' ' + entryClassName : entryClassName
    for (const rule of entryRules) {
      if (seen.has(rule[0])) continue
      seen.add(rule[0])
      rules.push(rule)
    }
  }
  return [className, rules]
}
