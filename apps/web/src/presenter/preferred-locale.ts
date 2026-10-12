import { LOCALES, type Locale } from '@overtone/messages'

/** The show is in Brazilian Portuguese, so it is the default for a stranger. */
const DEFAULT: Locale = 'pt'

/**
 * Which catalogue to read a shared page in.
 *
 * The shared page is the one screen somebody outside the group ever sees,
 * and it was hardcoded to Portuguese — `<html lang>` included, which is how
 * a screen reader decides how to pronounce what is on it.
 *
 * Only the language subtag is compared. A browser asking for `pt-PT` is not
 * asking for Brazilian Portuguese, but it is certainly not asking for
 * English, and the choice here is between two catalogues rather than
 * between regions.
 *
 * Note this never translates the quotes. They are what was said.
 */
export function preferredLocale(acceptLanguage: string | undefined | null): Locale {
  if (typeof acceptLanguage !== 'string') return DEFAULT

  const wanted = acceptLanguage
    .split(',')
    .map((entry) => {
      const [tag, ...rest] = entry.trim().split(';')
      const quality = rest
        .map((part) => /^\s*q\s*=\s*(?<value>[\d.]+)\s*$/u.exec(part)?.groups?.['value'])
        .find((found) => found !== undefined)

      // A malformed q is not a reason to drop the entry; the default weight
      // for a tag with no q at all is 1.
      const weight = quality === undefined ? 1 : Number.parseFloat(quality)

      return {
        language: (tag ?? '').trim().toLowerCase().split('-')[0] ?? '',
        weight: Number.isNaN(weight) ? 1 : weight,
      }
    })
    // q=0 is the browser saying "not this one".
    .filter(({ weight }) => weight > 0)
    .sort((one, other) => other.weight - one.weight)

  const match = wanted.find(({ language }) => LOCALES.includes(language as Locale))

  return match === undefined ? DEFAULT : (match.language as Locale)
}
