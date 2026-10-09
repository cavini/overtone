import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

export default withNextIntl({
  /*
   * The workspace packages are ESM TypeScript, so their imports carry `.js`
   * specifiers that point at `.ts` files — correct for Node and for `tsc`,
   * and unresolvable for a bundler that takes the extension literally. This
   * is the one place the two conventions are reconciled, rather than the repo
   * keeping two import styles.
   */
  webpack: (config: {
    resolve: { extensionAlias?: Record<string, readonly string[]> }
  }) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    }
    return config
  },
  // The workspace packages are TypeScript source, not built output, so Next
  // has to compile them. Keeping them as source is deliberate: one build,
  // one set of types, no stale `dist` to go out of step with the tests.
  transpilePackages: ['@overtone/core', '@overtone/adapters', '@overtone/db', '@overtone/messages'],
  typedRoutes: true,
})
