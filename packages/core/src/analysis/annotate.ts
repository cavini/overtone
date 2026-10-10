import type { Annotated, LemmaLookup, LemmaSource, Token } from '../domain/token.js'
import { classify } from './classify.js'
import { languagePack, type AudioLanguage } from './language-pack.js'

/**
 * Attaches a lemma and a class to every token.
 *
 * Four tiers, in descending order of confidence. A short hand-written list
 * comes first, for the handful of words where the dictionary is correct
 * about Portuguese and wrong about people — `cara` is "dude", not
 * "expensive". The dictionary is exact and
 * is the only thing that can tell `casas` (house) from `casar` (to marry) —
 * a stemmer folds both to `cas`. Failing that, the stemmer handles plurals of
 * words no dictionary will hold: names, slang, in-jokes, English borrowings.
 * Failing that too, the word stands for itself.
 *
 * Which tier produced a lemma is recorded, because a grouping the user cannot
 * interrogate is a grouping they cannot correct.
 *
 * Generic over the token so that timings survive: a timed token in, a timed
 * annotated token out.
 */
export function annotate<T extends Token>(
  tokens: readonly T[],
  lemmas: LemmaLookup,
  language: AudioLanguage,
): Array<Annotated<T>> {
  const { overrides, stem } = languagePack(language)

  return tokens.map((token) => {
    const corrected = overrides[token.surface]
    const fromDictionary = lemmas.get(token.surface)

    let lemma: string
    let lemmaSource: LemmaSource

    if (corrected !== undefined) {
      lemma = corrected
      lemmaSource = 'override'
    } else if (fromDictionary !== undefined) {
      lemma = fromDictionary
      lemmaSource = 'dictionary'
    } else {
      const stemmed = stem(token.surface)
      lemma = stemmed
      lemmaSource = stemmed === token.surface ? 'surface' : 'stemmer'
    }

    return {
      ...token,
      lemma,
      lemmaSource,
      tokenClass: classify(token.surface, language),
    }
  })
}
