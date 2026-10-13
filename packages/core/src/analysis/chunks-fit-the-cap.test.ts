// ADR 0020 · a chunk has to fit in one request
//
// The transcriber refuses anything over 25 MB, and nothing checks a chunk's
// size before sending it — an oversized chunk is discovered by being
// refused, after the upload.
//
// This is a property of the *settled* boundaries, not the planned ones.
// Moving a seam to find a gap makes one chunk longer, and a planned chunk
// sized to sit just under the cap has no room to grow into.
import { describe, expect, it } from 'vitest'
import { BYTES_PER_MS, MAX_CHUNK_MS, planChunks } from './chunking.js'
import { SEARCH_RADIUS_MS } from './quiet-cut.js'
import { settleChunks } from './settle-chunks.js'

/** What the transcriber refuses. */
const REQUEST_CAP_BYTES = 25_000_000

const FRAME_MS = 20

/**
 * The worst case for growth: silence everywhere, so every seam is free to
 * move as far as it is allowed in whichever direction it likes.
 */
const allQuiet = (durationMs: number): number[] =>
  Array.from({ length: Math.round(durationMs / FRAME_MS) }, () => 0)

/** Speech with a gap exactly where a seam would most like to run to. */
const gapsFarApart = (durationMs: number): number[] =>
  Array.from({ length: Math.round(durationMs / FRAME_MS) }, (_, frame) => {
    const ms = frame * FRAME_MS
    // A gap every chunk-length plus the full search radius, so each seam is
    // pulled as far forward as it is permitted to go.
    return ms % 60_000 >= 59_000 ? 0 : 1
  })

describe('a settled chunk still fits in one request', () => {
  it('is sized under the cap by arithmetic, not by hope', () => {
    expect(MAX_CHUNK_MS * BYTES_PER_MS).toBeLessThan(REQUEST_CAP_BYTES)
  })

  /*
   * The bound that matters. A seam can move either way, so a chunk between
   * two seams moving apart grows by twice the radius — which is why the
   * planned length has to leave room for 2 × the radius, not one.
   */
  it('leaves room for both of its seams to move', () => {
    const longestPlanned = Math.max(
      ...planChunks(4 * 60 * 60_000).map((chunk) => chunk.endMs - chunk.startMs),
    )

    expect(longestPlanned + 2 * SEARCH_RADIUS_MS).toBeLessThanOrEqual(MAX_CHUNK_MS)
  })

  it.each([
    ['a two-hour episode', 2 * 60 * 60_000],
    ['two and a quarter hours', 135 * 60_000],
    ['an awkward length', 97 * 60_000 + 37_000],
    ['just over one chunk', 13 * 60_000],
    ['four hours', 4 * 60 * 60_000],
  ])('never exceeds the cap for %s', (_what, durationMs) => {
    for (const loudness of [allQuiet(durationMs), gapsFarApart(durationMs)]) {
      const settled = settleChunks(planChunks(durationMs), loudness, FRAME_MS)

      for (const chunk of settled) {
        const lengthMs = chunk.endMs - chunk.startMs
        expect(
          lengthMs * BYTES_PER_MS,
          `chunk ${String(chunk.index)} is ${String(Math.round(lengthMs / 60_000))} min`,
        ).toBeLessThan(REQUEST_CAP_BYTES)
      }
    }
  })
})
