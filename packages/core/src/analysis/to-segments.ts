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
  /*
   * One object per group, carrying its own window and its own tokens —
   * rather than three arrays indexed in step. Parallel arrays would need an
   * `undefined` guard at every lookup that can never fire, which is both
   * noise and a line no test can reach.
   */
  const lines = groups.map((group) => ({
    group,
    from: group.startMs,
    // `groupWords` never emits an empty group — its flush returns early on
    // one — so the last word is always there.
    to: group.words[group.words.length - 1]?.startMs ?? group.startMs,
    held: [] as TranscriptSegment['words'][number][],
  }))

  const bySlot = new Map<number, Array<(typeof lines)[number]>>()
  for (const line of lines) {
    const first = Math.floor(line.from / SLOT_MS)
    const last = Math.floor(line.to / SLOT_MS)
    for (let slot = first; slot <= last; slot += 1) {
      const already = bySlot.get(slot)
      if (already === undefined) bySlot.set(slot, [line])
      else already.push(line)
    }
  }

  for (const token of tokens) {
    for (const line of bySlot.get(Math.floor(token.startMs / SLOT_MS)) ?? []) {
      // The slot is a coarse ten seconds and a window is not, so landing in
      // the slot is not yet belonging to the line.
      if (token.startMs < line.from || token.startMs > line.to) continue

      line.held.push({
        surface: token.surface,
        lemma: token.lemma,
        startMs: token.startMs,
        endMs: token.endMs,
        tokenClass: token.tokenClass,
      })
    }
  }

  return (
    lines
      .map(({ group, held }, position) => ({
        position,
        startMs: group.startMs,
        endMs: group.endMs,
        text: group.words.map((word) => word.text).join(' '),
        words: held,
      }))
      // A segment can end up with no countable words at all — a stretch of pure
      // punctuation. Keeping it would give the reader an empty paragraph.
      .filter((segment) => segment.words.length > 0)
      .map((segment, position) => ({ ...segment, position }))
  )
}
