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
  /*
   * The three response headers that were missing entirely.
   *
   * Vercel supplies HSTS; these it does not. Deliberately the three with no
   * breakage risk — a Content-Security-Policy belongs here too and is not
   * here yet, because this app uploads straight to Supabase storage from the
   * browser and a wrong `connect-src` breaks that silently. That one needs an
   * upload exercised against it before it ships.
   */
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        /*
         * Nothing frames this. There is a sign-in form and a delete button in
         * here, which is the pair clickjacking exists for.
         */
        { key: 'X-Frame-Options', value: 'DENY' },
        // No MIME sniffing. Episode audio is served from storage rather than
        // here, but a transcript rendered as something executable would be
        // the same class of mistake.
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        /*
         * Send the origin and never the path. A sign-in link carries its
         * token in the query string, and with no policy at all the default
         * is to put the full URL in the `Referer` of anything that page
         * loads.
         */
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    },
  ],
  typedRoutes: true,
})
