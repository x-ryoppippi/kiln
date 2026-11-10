import react from '@vitejs/plugin-react'
import kiln from 'unplugin-kiln'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [kiln.vite({ extract: process.env.KILN_EXTRACT === '1' }), react({ jsxImportSource: 'kiln' })],
})
