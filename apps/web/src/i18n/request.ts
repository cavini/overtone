import { en, pt, type Locale } from '@overtone/messages'
import { hasLocale } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'
import { routing } from './routing.js'

/** The same catalogues the domain's message codes are rendered from. */
const CATALOGUES: Record<Locale, Record<string, string>> = { pt, en }

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale

  return { locale, messages: CATALOGUES[locale] }
})
