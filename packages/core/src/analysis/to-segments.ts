import type { Annotated, TimedToken } from '../domain/token.js'
import type { TimedWord } from '../domain/timed-word.js'
import type { TranscriptSegment } from '../domain/transcript-segment.js'
import { DEFAULT_MAX_WORDS, groupWords } from './group-words.js'

/**
 * Groups a transcript's words into readable, seekable segments.
 *
 * A segment is what a quote links to and what the transcript reader pages
 * through, so it needs both the words as they were said and a time span a
 * player can seek to.
 *
 * Where the breaks fall is `groupWords`, shared with the live reader so that
 * a search result and the transcript on screen cannot disagree about where a
 * line starts.
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
  return (
    groupWords(words, maxWords)
      .map((group, position) => ({
        position,
        startMs: group.startMs,
        endMs: group.endMs,
        text: group.words.map((word) => word.text).join(' '),
        words: tokens
          .filter(
            (token) =>
              token.startMs >= group.startMs && token.startMs <= (group.words.at(-1)?.startMs ?? 0),
          )
          .map((token) => ({
            surface: token.surface,
            lemma: token.lemma,
            startMs: token.startMs,
            endMs: token.endMs,
            tokenClass: token.tokenClass,
          })),
      }))
      // A segment can end up with no countable words at all — a stretch of pure
      // punctuation. Keeping it would give the reader an empty paragraph.
      .filter((segment) => segment.words.length > 0)
      .map((segment, position) => ({ ...segment, position }))
  )
}
