import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // `testing/` is test infrastructure, not product code. Its guards —
      // `if (!outcome.ok) throw` — are unreachable against a correct
      // implementation, so measuring them would punish the right design. The
      // fakes are held to the shared contract suite instead, which is a
      // stronger guarantee than line coverage.
      exclude: ['src/**/*.test.ts', 'src/**/index.ts', 'src/testing/**'],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
})
