import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  /*
   * The app's tsconfig says `jsx: preserve`, because Next compiles JSX
   * itself. Vitest has no Next in front of it, so something has to, and
   * without this a `.test.tsx` fails to parse at its first tag. The
   * `esbuild` option does not reach it: Vitest 5 transforms with Rolldown,
   * which does not read that config.
   */
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // The database-backed ones have their own config, and their own reason
    // to run one at a time. See `vitest.integration.config.ts`.
    exclude: ['src/**/*.live.test.ts', 'node_modules/**'],
    environment: 'node',
    // A `.test.tsx` opts into a DOM with a docblock of its own. Setup runs
    // for every test either way, and skips the unmount where there is no
    // document to unmount from.
    setupFiles: ['src/test-setup.ts'],
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
