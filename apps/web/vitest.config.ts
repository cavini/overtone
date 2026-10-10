import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // The database-backed ones have their own config, and their own reason
    // to run one at a time. See `vitest.integration.config.ts`.
    exclude: ['src/**/*.live.test.ts', 'node_modules/**'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // The layers that carry logic: turning numbers into words, and working
      // out what a file is and how long it runs. Components are checked in a
      // browser, and the i18n wiring is four lines of framework glue that
      // fails loudly at build time — counting their lines measures nothing.
      include: ['src/presenter/**/*.ts', 'src/audio/**/*.ts', 'src/i18n/ui.ts'],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
})
