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
/**
 * How wide a slot of the time index is.
 *
 * A segment spans roughly fourteen seconds, so ten-second slots put each
 * group in two of them and leave two or three groups to check per token.
 * The constant only trades memory against how many groups a token has to be
 * compared with; it changes no answer.
 */
const SLOT_MS = 10_000

export function toSegments(
  words: readonly TimedWord[],
  tokens: ReadonlyArray<Annotated<TimedToken>>,
  maxWords: number = DEFAULT_MAX_WORDS,
  boundariesMs: readonly number[] = [],
): TranscriptSegment[] {
  const groups = groupWords(words, maxWords, boundariesMs)

  /*
   * Which tokens belong to which group, in one pass over the tokens.
   *
   * This was `tokens.filter(...)` inside the map over groups —
   * **O(groups × tokens)**, which for a two-hour episode is about 1 400
   * groups against 20 000 tokens. Measured at 571 ms, the single most
   * expensive step in the analysis, and rising with the square.
   *
   * A time index rather than a binary search, because **token start times
   * are not sorted**: 4.5 % of them run backwards in a real episode, by as
   * much as 420 ms, because people talk over each other. Anything assuming
   * order here would quietly drop those tokens from their segment, and the
   * transcript would simply be missing words with nothing to show for it.
   *
   * Each group is registered in every slot its window touches, and each
   * token checks only the slot it falls in. Same answer as the filter,
   * including a token that lands in two overlapping windows and belongs to
   * both, and tokens in no window being left out.
   */
  const windows = groups.map((group) => ({
    from: group.startMs,
    to: group.words.at(-1)?.startMs ?? 0,
  }))

  const bySlot = new Map<number, number[]>()
  for (const [at, window] of windows.entries()) {
    const first = Math.floor(window.from / SLOT_MS)
    const last = Math.floor(window.to / SLOT_MS)
    for (let slot = first; slot <= last; slot += 1) {
      const already = bySlot.get(slot)
      if (already === undefined) bySlot.set(slot, [at])
      else already.push(at)
    }
  }

  const held: Array<TranscriptSegment['words'][number][]> = groups.map(() => [])
  for (const token of tokens) {
    for (const at of bySlot.get(Math.floor(token.startMs / SLOT_MS)) ?? []) {
      const window = windows[at]
      if (window === undefined) continue
      if (token.startMs < window.from || token.startMs > window.to) continue

      held[at]?.push({
        surface: token.surface,
        lemma: token.lemma,
        startMs: token.startMs,
        endMs: token.endMs,
        tokenClass: token.tokenClass,
      })
    }
  }

  return (
    groups
      .map((group, position) => ({
        position,
        startMs: group.startMs,
        endMs: group.endMs,
        text: group.words.map((word) => word.text).join(' '),
        words: held[position] ?? [],
      }))
      // A segment can end up with no countable words at all — a stretch of pure
      // punctuation. Keeping it would give the reader an empty paragraph.
      .filter((segment) => segment.words.length > 0)
      .map((segment, position) => ({ ...segment, position }))
  )
}
