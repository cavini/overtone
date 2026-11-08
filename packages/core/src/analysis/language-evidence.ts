import { AUDIO_LANGUAGES, type AudioLanguage } from '../domain/audio-language.js'
import { languagePack } from './language-pack.js'
import { normalize } from './normalize.js'

/**
 * How many function words it takes before the words get a say.
 *
 * A chunk of music or silence comes back with almost no words in it, and a
 * transcript of four would otherwise return a verdict with the same shape
 * and the same authority as one drawn from a minute of speech.
 */
export const MIN_STOP_WORD_EVIDENCE = 8

/**
 * How much of the evidence the winner has to hold.
 *
 * Two thirds. Speech is overwhelmingly function words, so a real episode
 * clears this by a distance; what it is actually here for is the passage
 * that does not — somebody reading an English quote aloud, or a stretch
 * where the transcriber itself was switching between the two. A near-tie is
 * the one case where guessing is worse than saying nothing.
 */
const MAJORITY = 2 / 3

export interface StopWordEvidence {
  /** Undefined when the words do not make a clear enough case either way. */
  readonly language: AudioLanguage | undefined
  readonly pt: number
  readonly en: number
}

/**
 * The stop words that belong to exactly one of the languages.
 *
 * `a`, `as`, `do`, `no` and `me` are function words in both — the only five
 * of 279 and 255 — and a hit on one of them is evidence of nothing. Counted
 * naively it is evidence of *both*, which on a half-minute probe is enough
 * to swing a verdict. Everything else discriminates, which is why two lists
 * that overlap can still be used to tell them apart.
 */
const EXCLUSIVE: ReadonlyMap<string, AudioLanguage> = (() => {
  const seen = new Map<string, AudioLanguage | undefined>()

  for (const language of AUDIO_LANGUAGES) {
    for (const word of languagePack(language).stopWords) {
      // Second sighting: a function word in both, so it belongs to neither.
      seen.set(word, seen.has(word) ? undefined : language)
    }
  }

  return new Map(
    [...seen].filter((entry): entry is [string, AudioLanguage] => entry[1] !== undefined),
  )
})()

/**
 * What the transcript itself says it is, judged by its function words.
 *
 * Free, in the sense that matters here: it reads text that has already been
 * paid for rather than sending audio anywhere, so it can check every
 * episode without spending a second of the transcription allowance.
 *
 * **A tripwire, not a verifier, and the difference is worth being exact
 * about.** The transcriber picks the words, so when it transcribes in the
 * wrong language and does so cleanly, the words come back agreeing with the
 * mistake and this agrees with them. What it catches is the louder failure:
 * a transcript whose function words contradict the language it was
 * transcribed in, which is what a mismatched transcription produces when it
 * leaks the language actually being spoken instead of rendering it. On a
 * full episode it has a second use — twenty thousand words of real speech
 * leave overwhelming evidence either way, so *declining* on one is itself a
 * sign something is wrong with the transcript.
 *
 * It is therefore never a reason to believe a detection was right. The
 * independent check on that is the transcriber's own per-segment confidence,
 * which collapses when it is forced into a language the audio is not in; it
 * sits unread in the payload we already store (US-012).
 *
 * Deliberately crude about splitting. No enclitic rule, no contraction
 * rule, no language pack beyond the two word lists, because the pack cannot
 * be chosen until the question this answers has been answered. It does not
 * need them: the signal is carried by bare high-frequency words — `que`,
 * `não`, `ele` against `the`, `and`, `of` — which survive any reasonable
 * split, and the words that would need a rule to recover are not the ones
 * doing the work.
 */
export function languageFromStopWords(text: string): StopWordEvidence {
  const tally: Record<AudioLanguage, number> = { pt: 0, en: 0 }

  const normalized = normalize(text)
  for (const word of normalized.length === 0 ? [] : normalized.split(' ')) {
    const language = EXCLUSIVE.get(word)
    if (language !== undefined) tally[language] += 1
  }

  const total = tally.pt + tally.en
  const winner = tally.pt >= tally.en ? 'pt' : 'en'

  const decided = total >= MIN_STOP_WORD_EVIDENCE && tally[winner] >= total * MAJORITY

  return { language: decided ? winner : undefined, pt: tally.pt, en: tally.en }
}
