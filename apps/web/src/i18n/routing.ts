import { LOCALES, DEFAULT_LOCALE } from '@overtone/messages'
import { defineRouting } from 'next-intl/routing'

/**
 * Both languages, in the URL.
 *
 * The locale list comes from the message catalogue rather than being restated
 * here: a language the catalogue cannot render must not be reachable, and the
 * two drifting apart is exactly how a half-translated page ships.
 *
 * `always` prefixes, so `/pt/...` and `/en/...` are both real URLs. A shared
 * link then carries the language it was read in, which matters for a product
 * whose whole output is numbers formatted per locale.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
})
