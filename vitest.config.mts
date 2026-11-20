import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@shared': resolve(process.cwd(), 'src/shared'),
      '@renderer': resolve(process.cwd(), 'src/renderer/src')
    }
  }
})
