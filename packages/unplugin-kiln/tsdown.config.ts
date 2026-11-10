import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/transform.ts'],
  format: 'esm',
  dts: true,
  fixedExtension: false,
})
