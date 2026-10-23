import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // src/GlobalSchemaGraph is reference code with Jest tests of its own; e2e/ runs under Playwright.
    exclude: ['node_modules', 'dist', 'src/GlobalSchemaGraph', 'e2e'],
  },
})
