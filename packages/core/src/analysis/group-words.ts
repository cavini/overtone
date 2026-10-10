import type { TimedWord } from '../domain/timed-word.js'

/**
 * Transcribed speech sometimes runs for minutes without a full stop. A cap
 * keeps the reader usable when punctuation never arrives.
 */
export const DEFAULT_MAX_WORDS = 40

const SENTENCE_END = /[.!?…]["')\]]?$/u
const HAS_LETTER = /\p{L}/u

/**
 * A full stop only ends a sentence if there was a sentence.
 *
 * Transcribers emit bare punctuation — a lone `...` for a pause — and
 * treating that as a sentence boundary cuts a thought in half and leaves a
 * segment trailing off into nothing.
 */
const endsASentence = (text: string): boolean =>
  HAS_LETTER.test(text) && SENTENCE_END.test(text)

/** A run of words that belong on one line, and the span it covers. */
export interface WordGroup {
  readonly startMs: number
  readonly endMs: number
  readonly words: readonly TimedWord[]
}

/**
 * Cuts a transcript into lines at the places a reader expects a break.
 *
 * The one rule for where the transcript breaks. Two things need it and they
 * must agree: the stored segments a quote links to, and the live reader,
 * which has only raw chunk words because segments are not written until the
 * last chunk lands. Two implementations of "where does a line start" would
 * mean a search result pointing at a line the reader never drew.
 *
 * Every word comes back in exactly one group — the page shows the whole
 * transcript, so dropping one here would lose it from the screen.
 */
export function groupWords(
  words: readonly TimedWord[],
  maxWords: number = DEFAULT_MAX_WORDS,
): WordGroup[] {
  const groups: WordGroup[] = []
  let current: TimedWord[] = []

  const flush = (): void => {
    const first = current[0]
    const last = current.at(-1)
    if (first === undefined || last === undefined) return

    groups.push({ startMs: first.startMs, endMs: last.endMs, words: current })
    current = []
  }

  for (const word of words) {
    current.push(word)
    if (endsASentence(word.text) || current.length >= maxWords) flush()
  }

  flush()
  return groups
}
