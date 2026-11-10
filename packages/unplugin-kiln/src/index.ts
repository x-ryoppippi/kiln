import { createUnplugin, type UnpluginInstance } from 'unplugin'

import { transform, VIRTUAL_PREFIX, type TransformOptions } from './transform.ts'

export type Options = TransformOptions

const SOURCE = /\.[cm]?[jt]sx?(?:$|\?)/
const VIRTUAL_ID = new RegExp('^' + VIRTUAL_PREFIX)

export const unplugin: UnpluginInstance<Options | undefined, false> = createUnplugin((options = {}) => {
  const cssModules = new Map<string, string>()
  let invalidate: ((id: string) => void) | undefined

  return {
    name: 'kiln',
    enforce: 'pre',
    transform: {
      filter: { id: { include: SOURCE, exclude: /\/node_modules\// } },
      handler(code, id) {
        const result = transform(code, id, options)
        if (!result) return
        if (result.css && cssModules.get(result.css.id) !== result.css.code) {
          cssModules.set(result.css.id, result.css.code)
          invalidate?.(result.css.id)
        }
        return { code: result.code, map: result.map }
      },
    },
    resolveId: {
      filter: { id: VIRTUAL_ID },
      handler(id) {
        return id
      },
    },
    load: {
      filter: { id: VIRTUAL_ID },
      handler(id) {
        return cssModules.get(id) ?? ''
      },
    },
    vite: {
      configureServer(server) {
        invalidate = (id) => {
          const module = server.moduleGraph.getModuleById(id)
          if (module) void server.reloadModule(module)
        }
      },
    },
  }
})

export default unplugin
export const vite: UnpluginInstance<Options | undefined, false>['vite'] = unplugin.vite
export const rolldown: UnpluginInstance<Options | undefined, false>['rolldown'] = unplugin.rolldown
export const rollup: UnpluginInstance<Options | undefined, false>['rollup'] = unplugin.rollup
export const webpack: UnpluginInstance<Options | undefined, false>['webpack'] = unplugin.webpack
export const rspack: UnpluginInstance<Options | undefined, false>['rspack'] = unplugin.rspack
export const esbuild: UnpluginInstance<Options | undefined, false>['esbuild'] = unplugin.esbuild
export { transform, type TransformOptions, type TransformResult } from './transform.ts'
