import type { AudioChunk } from '../domain/audio-chunk.js'
import { SEARCH_RADIUS_MS, peakOf, quietestCut } from './quiet-cut.js'

/**
 * A chunk must keep enough audio to be worth a request of its own.
 *
 * Two seams moving towards each other could otherwise leave a sliver
 * between them — a round trip, a row and a stitching seam for a few seconds
 * of audio.
 */
const MIN_CHUNK_MS = 60_000

/**
 * Moves each seam to the nearest gap between words, once.
 *
 * The planned boundaries come from the clock, so they land mid-word most of
 * the time, and a transcriber handed half a word returns a whole one it can
 * pronounce (US-040). This walks the *seams* rather than the chunks, because
 * a seam belongs to two chunks at once: the one that ends there and the one
 * that begins there must be given the same number, or the audio between them
 * is transcribed twice or not at all.
 *
 * The first start and the last end are not seams — they are the ends of the
 * episode — and never move.
 *
 * Where no gap is findable the planned boundary stands. That is the honest
 * answer for ninety unbroken seconds of people talking over each other, and
 * it is exactly what the splitter did before any of this existed.
 */
export function settleChunks(
  planned: readonly AudioChunk[],
  loudness: readonly number[],
  frameMs: number,
): AudioChunk[] {
  if (planned.length <= 1) return [...planned]

  // Measured once. Every seam asks the same question of the same profile.
  const loudest = peakOf(loudness)

  const seams: number[] = []
  let previous = planned[0]?.startMs ?? 0

  for (const chunk of planned.slice(1)) {
    /*
     * The radius is narrowed so a moved seam can never cross the one before
     * it or swallow the chunk it opens. Both neighbours are the *planned*
     * positions rather than the settled ones, so each seam is decided
     * independently of how its neighbour happened to move — the alternative
     * drifts, each decision nudging the next.
     */
    const room = Math.min(
      SEARCH_RADIUS_MS,
      Math.max(0, chunk.startMs - previous - MIN_CHUNK_MS),
      Math.max(0, chunk.endMs - chunk.startMs - MIN_CHUNK_MS),
    )

    const settled = quietestCut(loudness, {
      frameMs,
      targetMs: chunk.startMs,
      radiusMs: room,
      loudest,
    })

    seams.push(settled)
    previous = settled
  }

  const edges = [planned[0]?.startMs ?? 0, ...seams, planned.at(-1)?.endMs ?? 0]

  return planned.map((chunk, at) => ({
    ...chunk,
    index: at,
    startMs: edges[at] ?? chunk.startMs,
    endMs: edges[at + 1] ?? chunk.endMs,
  }))
}
