import type { Annotated, TimedToken } from '../domain/token.js'
import type { TimedWord } from '../domain/timed-word.js'
import type { TranscriptSegment } from '../domain/transcript-segment.js'

/**
 * Transcribed speech sometimes runs for minutes without a full stop. A cap
 * keeps the reader usable when punctuation never arrives.
 */
const DEFAULT_MAX_WORDS = 40

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

/**
 * Groups a transcript's words into readable, seekable segments.
 *
 * A segment is what a quote links to and what the transcript reader pages
 * through, so it needs both the words as they were said and a time span a
 * player can seek to.
 *
 * Breaks happen at sentence endings, which is where a reader expects them,
 * and at a word cap, because transcribed speech often has no punctuation for
 * a very long stretch and one unbroken paragraph is unreadable.
 *
 * The analysed tokens are matched to their segment by **time** rather than by
 * position. One spoken word can become two tokens — `diga-me` is one and two
 * — and another can vanish entirely once punctuation is stripped, so counting
 * positions in step would drift apart almost immediately.
 */
export function toSegments(
  words: readonly TimedWord[],
  tokens: ReadonlyArray<Annotated<TimedToken>>,
  maxWords: number = DEFAULT_MAX_WORDS,
): TranscriptSegment[] {
  const segments: TranscriptSegment[] = []
  let current: TimedWord[] = []

  const flush = (): void => {
    if (current.length === 0) return

    const first = current[0]
    const last = current.at(-1)
    if (first === undefined || last === undefined) return

    segments.push({
      position: segments.length,
      startMs: first.startMs,
      endMs: last.endMs,
      text: current.map((word) => word.text).join(' '),
      words: tokens
        .filter((token) => token.startMs >= first.startMs && token.startMs <= last.startMs)
        .map((token) => ({
          surface: token.surface,
          lemma: token.lemma,
          startMs: token.startMs,
          endMs: token.endMs,
          tokenClass: token.tokenClass,
        })),
    })

    current = []
  }

  for (const word of words) {
    current.push(word)
    if (endsASentence(word.text) || current.length >= maxWords) flush()
  }

  flush()

  // A segment can end up with no countable words at all — a stretch of pure
  // punctuation. Keeping it would give the reader an empty paragraph.
  return segments
    .filter((segment) => segment.words.length > 0)
    .map((segment, position) => ({ ...segment, position }))
}
