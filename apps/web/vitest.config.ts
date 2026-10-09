import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // The presenter is the layer under test here. Components are checked by
      // the browser, not by counting their lines.
      include: ['src/presenter/**/*.ts', 'src/i18n/**/*.ts'],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
})
