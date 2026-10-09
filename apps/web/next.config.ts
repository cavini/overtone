import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

export default withNextIntl({
  // The workspace packages are TypeScript source, not built output, so Next
  // has to compile them. Keeping them as source is deliberate: one build,
  // one set of types, no stale `dist` to go out of step with the tests.
  transpilePackages: ['@overtone/core', '@overtone/adapters', '@overtone/db', '@overtone/messages'],
  typedRoutes: true,
})
