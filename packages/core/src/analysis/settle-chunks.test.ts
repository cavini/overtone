// US-040 · "no word lost and none duplicated"
//
// Moving a boundary is only safe if both sides move together. The chunk
// that ends at a seam and the one that begins there must be given the same
// number, or the audio between them is either transcribed twice or not at
// all — and the counts move without anything looking wrong.
import { describe, expect, it } from 'vitest'
import { planChunks } from './chunking.js'
import { settleChunks } from './settle-chunks.js'

const FRAME_MS = 20

const profile = (...runs: Array<[level: 'loud' | 'quiet', ms: number]>): number[] =>
  runs.flatMap(([level, ms]) =>
    Array.from({ length: Math.round(ms / FRAME_MS) }, () => (level === 'loud' ? 1 : 0)),
  )

/** An hour of speech with a one-second gap every minute. */
const speechWithGaps = (durationMs: number): number[] =>
  Array.from({ length: Math.round(durationMs / FRAME_MS) }, (_, frame) => {
    const intoMinute = (frame * FRAME_MS) % 60_000
    return intoMinute >= 59_000 ? 0 : 1
  })

describe('settleChunks', () => {
  const settle = (chunks: ReturnType<typeof planChunks>, loudness: readonly number[]) =>
    settleChunks(chunks, loudness, FRAME_MS)

  it('leaves a single chunk exactly as planned', () => {
    const planned = planChunks(600_000)
    expect(planned).toHaveLength(1)

    expect(settle(planned, speechWithGaps(600_000))).toEqual(planned)
  })

  /*
   * The two ends are not boundaries between chunks — they are the start and
   * end of the episode. Moving them would drop audio off one end.
   */
  it('never moves the beginning or the end', () => {
    const durationMs = 60 * 60_000
    const settled = settle(planChunks(durationMs), speechWithGaps(durationMs))

    expect(settled[0]?.startMs).toBe(0)
    expect(settled.at(-1)?.endMs).toBe(durationMs)
  })

  // The property the scenario names: no word lost, none duplicated.
  it('hands every millisecond to exactly one chunk', () => {
    const durationMs = 60 * 60_000
    const settled = settle(planChunks(durationMs), speechWithGaps(durationMs))

    expect(settled.length).toBeGreaterThan(1)
    for (let at = 1; at < settled.length; at += 1) {
      expect(settled[at]?.startMs, `seam ${String(at)}`).toBe(settled[at - 1]?.endMs)
    }
  })

  it('actually moves the seams into the gaps', () => {
    const durationMs = 60 * 60_000
    const planned = planChunks(durationMs)
    const settled = settle(planned, speechWithGaps(durationMs))

    const moved = settled.filter((chunk, at) => chunk.startMs !== planned[at]?.startMs)
    expect(moved.length, 'no seam moved at all').toBeGreaterThan(0)

    // Every seam that moved landed inside a gap, which here is the last
    // second of some minute.
    for (const chunk of settled.slice(1)) {
      expect((chunk.startMs % 60_000) >= 59_000 || chunk.startMs % 60_000 === 0).toBe(true)
    }
  })

  it('keeps the chunks in order and none of them empty', () => {
    const durationMs = 60 * 60_000
    const settled = settle(planChunks(durationMs), speechWithGaps(durationMs))

    for (const [at, chunk] of settled.entries()) {
      expect(chunk.index, 'index').toBe(at)
      expect(chunk.endMs, `chunk ${String(at)} is empty or backwards`).toBeGreaterThan(chunk.startMs)
    }
  })

  /*
   * Unbroken speech across the whole search window. Nothing should move,
   * and the result has to be the plan rather than something subtly different
   * — this is the case that happens when the group talks over each other for
   * three minutes straight.
   */
  it('falls back to the plan when there is no gap anywhere', () => {
    const durationMs = 40 * 60_000
    const planned = planChunks(durationMs)

    expect(settle(planned, profile(['loud', durationMs]))).toEqual(planned)
  })

  it('returns nothing for nothing', () => {
    expect(settleChunks([], [], FRAME_MS)).toEqual([])
  })
})
