import { defineConfig } from 'vitest/config'

/**
 * Tests that need a real database.
 *
 * Kept out of `verify` because CI has no database — and because they write
 * to one.
 *
 * **One file at a time.** `advancePending` reaches for the oldest unfinished
 * episode *anywhere*, which is the point of it, so a parallel run has one
 * suite advancing another's half-seeded episode and failing on a row that
 * is being deleted underneath it. Measured: it passed alone and failed
 * about one run in three alongside the others.
 *
 *   pnpm --filter @overtone/web test:integration
 */
export default defineConfig({
  test: {
    include: ['src/**/*.live.test.ts'],
    environment: 'node',
    fileParallelism: false,
  },
})
