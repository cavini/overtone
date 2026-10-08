/**
 * Punctuation at the edges of a token carries no meaning; punctuation inside
 * one often does. `d'água` and `diga-me` must survive intact — splitting
 * clitics is the tokeniser's job, not this one's.
 */
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu

/**
 * Folds text to the form everything downstream counts against: NFC, lower
 * case, no edge punctuation, single-spaced.
 *
 * Diacritics are preserved, deliberately. Stripping them is the reflex in
 * English-language pipelines and it destroys meaning in Portuguese — `e`/`é`
 * (and/is), `por`/`pôr` (by/to put), `esta`/`está` (this/is) are different
 * words, and folding them together would silently merge their counts.
 *
 * Case folding is locale-independent so that the same input always yields the
 * same output, whatever machine it runs on.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFC')
    .split(/\s+/)
    .map((token) => token.replace(EDGE_PUNCTUATION, ''))
    .filter((token) => token.length > 0)
    .join(' ')
}
