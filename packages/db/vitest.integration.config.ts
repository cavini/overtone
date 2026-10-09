import { defineConfig } from 'vitest/config'

/**
 * Tests that need a real database.
 *
 * Mostly port contract suites: the fakes' arithmetic is TypeScript and the
 * real stores' is SQL, and nothing but Postgres can tell you whether the two
 * agree. They are kept out of `verify` because CI has no database — and
 * because they write to one.
 *
 *   pnpm --filter @overtone/db test:integration
 */
export default defineConfig({
  test: {
    include: ['src/**/*.live.test.ts'],
    environment: 'node',
    // One file at a time. They share the single allowance row, so a parallel
    // run would have them resetting each other's state.
    fileParallelism: false,
  },
})
