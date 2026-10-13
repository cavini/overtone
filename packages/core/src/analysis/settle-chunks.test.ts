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

  /*
   * Two seams both drawn towards the same gap.
   *
   * `planChunks` spaces its boundaries twelve minutes apart, so with a
   * ninety-second radius they can never reach each other — the guard cannot
   * bind on a real plan, and a test built from one passes whether the guard
   * is there or not. I wrote that test first and it proved nothing.
   *
   * This builds the plan by hand instead, because `settleChunks` takes a
   * list of chunks rather than a duration and is not entitled to assume
   * who made it. Hundred-second chunks with one gap at 150 s: both seams
   * can reach it, and without the guard both land on it and the chunk
   * between them disappears.
   */
  it('will not pull two seams onto the same gap', () => {
    const tight = [
      { index: 0, startMs: 0, endMs: 100_000 },
      { index: 1, startMs: 100_000, endMs: 200_000 },
      { index: 2, startMs: 200_000, endMs: 300_000 },
    ]
    const loudness = profile(['loud', 149_000], ['quiet', 2_000], ['loud', 149_000])

    const settled = settleChunks(tight, loudness, FRAME_MS)

    const starts = settled.map((chunk) => chunk.startMs)
    expect(new Set(starts).size, `two seams landed together: ${starts.join(', ')}`).toBe(
      starts.length,
    )
    for (const chunk of settled) {
      expect(chunk.endMs - chunk.startMs, `chunk ${String(chunk.index)} was squeezed to nothing`)
        .toBeGreaterThan(0)
    }
  })

  // A seam with no room either side simply stays where the plan put it.
  it('leaves a seam alone when there is no room to move it', () => {
    const tight = [
      { index: 0, startMs: 0, endMs: 70_000 },
      { index: 1, startMs: 70_000, endMs: 140_000 },
    ]
    const gapFarAway = profile(['loud', 10_000], ['quiet', 2_000], ['loud', 128_000])

    expect(settleChunks(tight, gapFarAway, FRAME_MS)).toEqual(tight)
  })

  it('returns nothing for nothing', () => {
    expect(settleChunks([], [], FRAME_MS)).toEqual([])
  })
})
