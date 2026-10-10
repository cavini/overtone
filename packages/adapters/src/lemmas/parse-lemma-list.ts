import { languagePack, normalize, type AudioLanguage } from '@overtone/core'

const BYTE_ORDER_MARK = '\uFEFF'
const HAS_LETTER = /\p{L}/u

/**
 * Reads a published lemma list into form→lemma pairs.
 *
 * The file is one pair per line, tab-separated, **lemma first**. Reading it
 * the other way round would map every word to an inflection of itself and
 * still look roughly plausible, so the order has its own test.
 *
 * Both sides are normalised on the way in, because a lookup only ever
 * happens against normalised tokens — an un-normalised dictionary would miss
 * every word that carried a capital or an accent in the source file, which is
 * most of them.
 *
 * Malformed lines are skipped rather than thrown on. The source is 850 000
 * lines of community-maintained data, with a byte-order mark, Windows line
 * endings and a little junk in it; one bad row should cost one word, not the
 * whole dictionary.
 */
export function parseLemmaList(
  text: string,
  language: AudioLanguage,
): Array<[form: string, lemma: string]> {
  // Pruning is only sound against the stemmer that will actually run at
  // lookup time. Judged by the Portuguese one, `news` looks like a row worth
  // keeping — it cuts to `new` — when the English stemmer leaves it alone and
  // the row is redundant.
  const { stem } = languagePack(language)
  const pairs: Array<[string, string]> = []
  const seen = new Set<string>()
  const lemmas = new Set<string>()

  const lines = text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text

  for (const line of lines.split(/\r?\n/)) {
    const tab = line.indexOf('\t')
    if (tab <= 0) continue

    const lemma = normalize(line.slice(0, tab))
    const form = normalize(line.slice(tab + 1))

    if (lemma.length === 0 || form.length === 0) continue
    // The source has junk in it — its first row maps a word to `00`. A side
    // with no letters is not a word, and no transcript will ever match it.
    if (!HAS_LETTER.test(lemma) || !HAS_LETTER.test(form)) continue
    if (seen.has(form)) continue

    // An identity row is usually redundant: a lookup miss falls through to
    // the stemmer, which leaves such a word alone and reaches the same
    // answer. Keep it only when the stemmer would get it wrong — `país` is
    // its own lemma, and a word ending in `s` would otherwise be cut to
    // `paí`.
    if (form === lemma && stem(form) === lemma) continue

    seen.add(form)
    lemmas.add(lemma)
    pairs.push([form, lemma])
  }

  // The dictionary must be authoritative for every word it knows about.
  //
  // The published file has no identity row for `país`; it appears only as the
  // lemma of `países`. Without an entry of its own, `país` misses the
  // dictionary, falls through to the stemmer, and — being a word that ends in
  // `s` — is counted as `paí`. 246 of the list's lemmas are exposed this way.
  //
  // Adding a row only where the stemmer disagrees keeps the cost to those few
  // hundred, and leaves provenance honest everywhere else.
  for (const lemma of lemmas) {
    if (seen.has(lemma)) continue
    if (stem(lemma) === lemma) continue

    seen.add(lemma)
    pairs.push([lemma, lemma])
  }

  return pairs
}
