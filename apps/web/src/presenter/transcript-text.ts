import { applyCorrections, type Correction } from '@overtone/core'
import { groupWords, stitchBoundaries, stitchChunks } from '@overtone/core/analysis'
import type { TimedWord } from '@overtone/core/domain'

/**
 * One line of the transcript, as something to read and to seek to.
 *
 * Text and a start, not timed words. The words carry a start and an end
 * each, which is what every count and every citation is built on — and is
 * also four times the bytes of the sentence they spell out. Reading needs
 * one timestamp per line, not per word, so the rest stops at the server.
 */
export interface TranscriptLine {
  /** The chunk this came out of, and its place in that chunk. Together, a key. */
  readonly chunk: number
  readonly position: number
  /** Where the line starts **in the episode**, which is what a search seeks to. */
  readonly startMs: number
  /**
   * The stretch of the episode this line's words occupy, for correcting it
   * (US-049).
   *
   * Taken from the words rather than from the line's start and end, because
   * `groupWords` divides words by position and their start times run
   * backwards 4.5 % of the time — so a line's earliest word is not reliably
   * its first one. A correction replaces every word whose start falls in
   * this span, and this is the span that holds exactly them.
   */
  readonly fromMs: number
  readonly toMs: number
  readonly text: string
}

/**
 * What an episode has to read so far, and where to carry on from.
 *
 * `nextFrom` is a cursor, and it is the whole design. An episode is
 * transcribed one chunk at a time against a refilling allowance (ADR 0020),
 * so a reader waiting for the rest asks again every few seconds for as long
 * as an hour. Answering each of those with the roughly 20,000 words already
 * on their screen would move megabytes a minute to say nothing happened.
 */
export interface TranscriptSoFar {
  readonly lines: readonly TranscriptLine[]
  readonly nextFrom: number
}

/** A stored chunk, narrowed to the part reading needs. */
interface TranscribedChunk {
  readonly index: number
  readonly offsetMs: number
  readonly words: readonly TimedWord[]
  /** Where the transcriber started each run of speech. Absent on old chunks. */
  readonly segmentStartsMs?: readonly number[] | undefined
}

/**
 * Reads the lines an episode has, from where the reader left off.
 *
 * Stops at the first missing index rather than skipping it. Chunks are paced
 * one at a time rather than fanned out, so they normally arrive in order —
 * but a transcript is read in sequence, and jumping a gap would quietly
 * present chunk three as what came after chunk one. Waiting costs one poll.
 *
 * Offsets through `stitchChunks` rather than adding `offsetMs` here. That
 * arithmetic is the most dangerous in the repo — it fails silently, leaving
 * every timestamp plausible and wrong — and it already has a round-trip
 * property test. A second copy of it would not.
 */
export function linesAfter(
  chunks: readonly TranscribedChunk[],
  from: number,
  /*
   * What somebody typed in place of what the transcriber heard (US-049).
   *
   * The reader reads the *chunks*, not the analysed segments — it has to,
   * because it shows words as they land and segments only exist once the
   * whole episode has been analysed. Which made it the one place a
   * correction never reached: the counts changed, the search changed, the
   * stored transcript changed, and the page still showed the misheard line.
   */
  corrections: readonly Correction[] = [],
): TranscriptSoFar {
  const byIndex = new Map(chunks.map((chunk) => [chunk.index, chunk]))
  const lines: TranscriptLine[] = []

  // The cursor comes off a query string, so it can be anything.
  let next = Math.max(0, Math.trunc(from))

  for (let chunk = byIndex.get(next); chunk !== undefined; chunk = byIndex.get(next)) {
    const index = next
    // The transcriber's own breaks as well as the punctuation, so two
    // people's turns do not land on one line.
    groupWords(
      applyCorrections(stitchChunks([chunk]), corrections),
      undefined,
      stitchBoundaries([chunk]),
    ).forEach(
      (group, position) => {
        const starts = group.words.map((word) => word.startMs)
        lines.push({
          chunk: index,
          position,
          startMs: group.startMs,
          fromMs: Math.min(...starts),
          // Exclusive, so the last word of the line is inside it.
          toMs: Math.max(...starts) + 1,
          text: group.words.map((word) => word.text).join(' '),
        })
      },
    )
    next += 1
  }

  return { lines, nextFrom: next }
}
