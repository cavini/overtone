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
  /*
   * Image optimisation off, because nothing uses it.
   *
   * `next/image` is imported nowhere in this app and no remote patterns are
   * configured, so `/_next/image` was an endpoint that answered the whole
   * internet without a session — the middleware does not cover `/_next/*` —
   * and gave us nothing in return. It carried an unauthenticated remote code
   * execution advisory up to 15.5.27, which is patched above; this is the
   * other half, so the next advisory against that handler cannot reach us at
   * all.
   *
   * Remove this only alongside an actual `next/image` usage, and then with
   * `remotePatterns` set rather than left open.
   */
  images: { unoptimized: true },
  typedRoutes: true,
})
