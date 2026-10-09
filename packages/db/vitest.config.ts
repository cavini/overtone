import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // `*.live.test.ts` needs a real database, so it is not a unit test and
    // must not run in `verify`. See `vitest.integration.config.ts`.
    exclude: ['src/**/*.live.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // The schema is a declaration, not behaviour: it is verified by
      // typechecking it against the domain read models, and by migrations
      // running against a real database. Line coverage of a table definition
      // measures nothing.
      enabled: false,
    },
  },
})
