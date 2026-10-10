import type { Annotated, LemmaLookup, LemmaSource, Token } from '../domain/token.js'
import { classify } from './classify.js'
import { languagePack, type AudioLanguage } from './language-pack.js'

/**
 * The shapes a Portuguese infinitive takes.
 *
 * Only a lemma shaped like one can be an invented verb, which keeps this
 * rule away from everything else the dictionary does — a plural folding
 * into its singular is not an infinitive and is never touched.
 */
const LOOKS_LIKE_AN_INFINITIVE = /(ar|er|ir|or)$/u

/**
 * Whether the dictionary has invented a verb for this word.
 *
 * The bundled list is mechanically generated and maps plain nouns onto
 * infinitives that barely exist: `gato` onto `gatar`, `filho` onto
 * `filhar`, `bebê` onto `beber`. Measured on a real episode, a quarter of
 * all mentions carried a label nobody had said.
 *
 * It cannot be told from the list's own contents — `filhar` carries sixty
 * inflected forms and `falar` fifty-nine. What tells them apart is a second
 * source that contains **only** verbs: a form it has never heard of is not
 * a verb form, so a lemma shaped like an infinitive for that form is an
 * invention.
 *
 * No second source means no opinion. Knowing nothing is not the same as
 * knowing it is not a verb, and the dictionary is right more often than it
 * is wrong.
 *
 * **An empty set counts as no source**, and that guard is the important
 * one. Portuguese speech always contains verb forms, so nothing matching
 * across an episode's whole vocabulary means the table was never loaded —
 * not that the language has no verbs. Read the other way it rejects
 * *every* verb lemma and silently destroys the grouping the dictionary is
 * there for. It did, in the integration test, the first time this ran.
 */
function invents(
  surface: string,
  lemma: string,
  verbForms: ReadonlySet<string> | undefined,
): boolean {
  if (verbForms === undefined || verbForms.size === 0) return false
  if (lemma === surface || !LOOKS_LIKE_AN_INFINITIVE.test(lemma)) return false

  return !verbForms.has(surface)
}

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
  verbForms?: ReadonlySet<string>,
): Array<Annotated<T>> {
  const { overrides, stem, mergesGender } = languagePack(language)

  return tokens.map((token) => {
    const corrected = overrides[token.surface]
    const fromDictionary = lemmas.get(token.surface)

    let lemma: string
    let lemmaSource: LemmaSource

    if (corrected !== undefined) {
      lemma = corrected
      lemmaSource = 'override'
    } else if (
      fromDictionary !== undefined &&
      !mergesGender(token.surface, fromDictionary) &&
      !invents(token.surface, fromDictionary, verbForms)
    ) {
      lemma = fromDictionary
      lemmaSource = 'dictionary'
    } else if (fromDictionary !== undefined) {
      /*
       * The dictionary had an answer and it was wrong in one of two ways:
       * it folded the word into its other gender — `menina` into `menino` —
       * or it invented a verb for it, `gato` into `gatar`. The word stands
       * for itself rather than falling through to the stemmer, which would
       * give `menin` and `gat`: not words either, and worse labels than the
       * one that was actually said.
       */
      lemma = token.surface
      lemmaSource = 'surface'
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
