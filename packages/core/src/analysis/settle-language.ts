import { AUDIO_LANGUAGES, type AudioLanguage } from '../domain/audio-language.js'

/**
 * Turns what each probe heard into the one language the episode gets.
 *
 * One language for the whole episode, not one per chunk, and that is the
 * reason this exists rather than each chunk being left to decide for
 * itself. The language picks the stop-word list, the stemmer and the half
 * of the lemma dictionary every count is computed from (ADR 0023) — so
 * chunks that disagreed would be analysed by different rules and stitched
 * into the same transcript, with one set of counts over both.
 *
 * A strict majority of the probes that answered, and nothing clever. The
 * robustness comes from having asked three separated windows
 * (`planLanguageProbes`) rather than from weighing their answers: a
 * mid-roll sting, a read-out English quote or one unlucky passage is a
 * minority of three and a coin toss out of one.
 */
export function settleLanguage(
  heard: readonly (AudioLanguage | undefined)[],
): AudioLanguage | undefined {
  const votes = new Map<AudioLanguage, number>()

  for (const language of heard) {
    // A probe that failed is not a vote. Counted as one it would let two
    // network errors hand the episode to whichever window happened to answer.
    if (language === undefined) continue
    votes.set(language, (votes.get(language) ?? 0) + 1)
  }

  const cast = [...votes.values()].reduce((total, count) => total + count, 0)
  if (cast === 0) return undefined

  /*
   * Strictly more than half, so an even split settles nothing.
   *
   * That is the right outcome rather than a gap in the logic: an evenly
   * split episode is either a detection this pipeline should not act on or
   * a genuinely bilingual recording, and a bilingual recording cannot be
   * analysed correctly under either pack. Stopping says so; a tiebreak
   * would pick one and report full counts for half an episode.
   */
  return AUDIO_LANGUAGES.find((language) => (votes.get(language) ?? 0) * 2 > cast)
}
