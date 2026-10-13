import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // src/GlobalSchemaGraph is reference code with Jest tests of its own.
    exclude: ['node_modules', 'dist', 'src/GlobalSchemaGraph'],
  },
})
