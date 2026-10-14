import type { TimedWord } from '../domain/timed-word.js'

/**
 * What somebody typed in place of what the transcriber heard.
 *
 * Addressed by **time**, not by word position. Two reasons, and both of them
 * are load-bearing:
 *
 * - A position shifts the moment any earlier correction changes how many
 *   words there are, so the second correction somebody makes would land in
 *   the wrong place.
 * - Word start times run backwards 4.5 % of the time in a real episode,
 *   because people talk over each other — so "the words from here to there"
 *   cannot be a slice either way.
 *
 * A span survives both. It is also what the reader already works in: a line
 * on screen *is* a stretch of time.
 */
export interface Correction {
  /** Inclusive. */
  readonly fromMs: number
  /** Exclusive. */
  readonly toMs: number
  /** What was actually said. Empty removes the line. */
  readonly text: string
}

/**
 * Replaces what the transcriber heard with what was said.
 *
 * The span is kept whatever is typed into it. Those two numbers were
 * measured from the audio and are the reason a count can be clicked at all,
 * so a correction may change the words inside a line and never where the
 * line sits. The typed words are spread evenly across it instead, which
 * makes their individual timings an approximation — nobody can know where
 * inside a second a word that was never heard would have fallen, and the
 * line itself stays exact.
 *
 * Everything downstream is re-derived from the result: counts, running
 * jokes, search, the series view. So this is where a correction becomes a
 * number rather than a note in the margin.
 */
export function applyCorrections(
  words: readonly TimedWord[],
  corrections: readonly Correction[],
): TimedWord[] {
  const spans = corrections.filter((correction) => correction.toMs > correction.fromMs)
  if (spans.length === 0) return [...words]

  const covering = (word: TimedWord): Correction | undefined =>
    spans.find(
      (correction) => word.startMs >= correction.fromMs && word.startMs < correction.toMs,
    )

  const written = new Set<Correction>()
  const corrected: TimedWord[] = []

  for (const word of words) {
    const correction = covering(word)
    if (correction === undefined) {
      corrected.push(word)
      continue
    }

    // The typed words go where the first word they replace was, so the
    // stream keeps its order even though the timings inside it do not.
    if (!written.has(correction)) {
      written.add(correction)
      corrected.push(...spread(correction))
    }
  }

  return corrected
}

/**
 * Lays the typed words out across the span.
 *
 * Each gets an equal slice, and each slice is left slightly open at the end
 * so two words never start at the same millisecond — a transcript where two
 * words claim one moment makes the reader's "which line is this" question
 * ambiguous for no reason.
 */
function spread(correction: Correction): TimedWord[] {
  const spoken = correction.text.trim().split(/\s+/u).filter((word) => word.length > 0)
  if (spoken.length === 0) return []

  const each = (correction.toMs - correction.fromMs) / spoken.length

  return spoken.map((text, at) => ({
    text,
    startMs: Math.round(correction.fromMs + at * each),
    endMs: Math.round(correction.fromMs + (at + 1) * each),
  }))
}
