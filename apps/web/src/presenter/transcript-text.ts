/**
 * One chunk of an episode, as something to read.
 *
 * Text, not timed words. The words carry a start and an end each, which is
 * what every count and every citation is built on — and is also four times
 * the bytes of the sentence they spell out. Nothing about reading needs them,
 * so they stop at the server.
 */
export interface TranscriptPart {
  readonly index: number
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
  readonly parts: readonly TranscriptPart[]
  readonly nextFrom: number
}

/** A stored chunk, narrowed to the part reading needs. */
interface TranscribedChunk {
  readonly index: number
  readonly words: readonly { readonly text: string }[]
}

/**
 * Reads the chunks an episode has, from where the reader left off.
 *
 * Stops at the first missing index rather than skipping it. Chunks are paced
 * one at a time rather than fanned out, so they normally arrive in order —
 * but a transcript is read in sequence, and jumping a gap would quietly
 * present chunk three as what came after chunk one. Waiting costs one poll.
 */
export function partsAfter(
  chunks: readonly TranscribedChunk[],
  from: number,
): TranscriptSoFar {
  const byIndex = new Map(chunks.map((chunk) => [chunk.index, chunk]))
  const parts: TranscriptPart[] = []

  // The cursor comes off a query string, so it can be anything.
  let next = Math.max(0, Math.trunc(from))

  for (let chunk = byIndex.get(next); chunk !== undefined; chunk = byIndex.get(next)) {
    // Joined with a space, the same way the stitched transcript is written.
    parts.push({ index: next, text: chunk.words.map((word) => word.text).join(' ') })
    next += 1
  }

  return { parts, nextFrom: next }
}
