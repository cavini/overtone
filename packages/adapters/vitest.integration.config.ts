import { defineConfig } from 'vitest/config'

/**
 * Tests that talk to a real service.
 *
 * Kept out of `verify` because CI has no credentials — and because they write
 * to a real bucket. Never Groq: the free tier's audio allowance is shared
 * with the actual users of the app, and a test suite that spent it would take
 * the product down.
 *
 *   pnpm --filter @overtone/adapters test:integration
 */
export default defineConfig({
  test: {
    include: ['src/**/*.live.test.ts'],
    environment: 'node',
    fileParallelism: false,
  },
})
