import { IntlMessageFormat } from 'intl-messageformat'
import {
  MESSAGE_PARAMS,
  type Locale,
  type MessageCode,
  type MessageParams,
} from './codes.js'
import en from './en.json' with { type: 'json' }
import pt from './pt.json' with { type: 'json' }

/**
 * `en-GB` rather than `en-US`, to match the copy — and because it joins lists
 * without the Oxford comma, which is what the English catalogue is written
 * for.
 */
const LOCALE_TAGS: Record<Locale, string> = { pt: 'pt-BR', en: 'en-GB' }

const CATALOGUES: Record<Locale, Record<string, string>> = { pt, en }

/**
 * Parsing an ICU message is not free, and these render on every page.
 * Keyed by locale and code, which are both finite and small.
 */
const compiled = new Map<string, IntlMessageFormat>()

/**
 * ICU has no notion of a list, so a list parameter is joined first.
 *
 * Doing it per locale matters more than it looks: Portuguese joins with `e`
 * and English with `and`, and a hard-coded comma is the kind of detail that
 * makes a translation read like a machine wrote it.
 */
function prepareParams(
  locale: Locale,
  code: MessageCode,
  params: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const kinds = MESSAGE_PARAMS[code] as Readonly<Record<string, string>>
  const prepared: Record<string, unknown> = {}

  for (const [name, value] of Object.entries(params)) {
    prepared[name] =
      kinds[name] === 'strings' && Array.isArray(value)
        ? new Intl.ListFormat(LOCALE_TAGS[locale], {
            style: 'long',
            type: 'conjunction',
          }).format(value as string[])
        : value
  }

  return prepared
}

/**
 * Turns a message code and its data into words.
 *
 * The only place in the product where a sentence is produced. Everything
 * below hands up a code and its numbers, which is what lets the same failure
 * be read in Portuguese or English — and what keeps a count from depending on
 * which language someone is reading.
 */
export function renderMessage<Code extends MessageCode>(
  locale: Locale,
  code: Code,
  params: MessageParams[Code],
): string {
  const cacheKey = `${locale}:${code}`
  let message = compiled.get(cacheKey)

  if (message === undefined) {
    message = new IntlMessageFormat(
      CATALOGUES[locale][code] ?? code,
      LOCALE_TAGS[locale],
    )
    compiled.set(cacheKey, message)
  }

  return String(
    message.format(prepareParams(locale, code, params as Record<string, unknown>)),
  )
}
