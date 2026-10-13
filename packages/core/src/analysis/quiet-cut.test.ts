// US-040 · "Splitting never cuts a word in half"
//
// The scenario that was never built. A chunk boundary at an arbitrary
// instant lands mid-word most of the time, and Whisper renders each half as
// a whole word it can pronounce — invented words that then enter the counts.
import { describe, expect, it } from 'vitest'
import { MIN_SILENCE_MS, SEARCH_RADIUS_MS, quietestCut } from './quiet-cut.js'

const FRAME_MS = 20

/** A loudness profile: `loud` frames at 1, `quiet` frames at 0. */
const profile = (...runs: Array<[level: 'loud' | 'quiet', ms: number]>): number[] =>
  runs.flatMap(([level, ms]) =>
    Array.from({ length: Math.round(ms / FRAME_MS) }, () => (level === 'loud' ? 1 : 0)),
  )

const cut = (loudness: readonly number[], targetMs: number, radiusMs = SEARCH_RADIUS_MS): number =>
  quietestCut(loudness, { frameMs: FRAME_MS, targetMs, radiusMs })

describe('quietestCut', () => {
  it('moves the cut into a nearby gap between words', () => {
    // Speech, then a one-second gap at 10s, then more speech.
    const loudness = profile(['loud', 10_000], ['quiet', 1_000], ['loud', 10_000])

    // The target falls in the middle of the speech after the gap.
    expect(cut(loudness, 12_000)).toBeGreaterThanOrEqual(10_000)
    expect(cut(loudness, 12_000)).toBeLessThanOrEqual(11_000)
  })

  it('stays put when there is no silence to move to', () => {
    const loudness = profile(['loud', 30_000])

    expect(cut(loudness, 15_000)).toBe(15_000)
  })

  /*
   * A gap shorter than this is a stop consonant or a breath inside a word,
   * not a space between words. Cutting there is the bug, not the fix.
   */
  it('ignores a gap too short to be between words', () => {
    const loudness = profile(['loud', 10_000], ['quiet', MIN_SILENCE_MS - 100], ['loud', 10_000])

    expect(cut(loudness, 10_500)).toBe(10_500)
  })

  it('takes a gap exactly at the minimum', () => {
    const loudness = profile(['loud', 10_000], ['quiet', MIN_SILENCE_MS], ['loud', 10_000])

    expect(cut(loudness, 10_500)).not.toBe(10_500)
  })

  /*
   * A chunk has to stay inside the duration and size ceilings it was planned
   * against (ADR 0020), so the cut cannot wander far to find a better gap.
   */
  it('will not wander outside the search radius', () => {
    const loudness = profile(['loud', 100_000], ['quiet', 2_000], ['loud', 100_000])

    expect(cut(loudness, 10_000, 5_000)).toBe(10_000)
  })

  it('prefers the gap nearest the target when there are several', () => {
    const loudness = profile(
      ['loud', 10_000], ['quiet', 1_000],
      ['loud', 10_000], ['quiet', 1_000],
      ['loud', 10_000],
    )

    // Target at 20.5s: the second gap (21s–22s) is nearer than the first.
    expect(cut(loudness, 20_500)).toBeGreaterThanOrEqual(21_000)
  })

  // Cutting at the centre of the gap leaves the most room on both sides for
  // the transcriber's own context window.
  it('cuts in the middle of the gap, not at its edge', () => {
    const loudness = profile(['loud', 10_000], ['quiet', 1_000], ['loud', 10_000])

    expect(cut(loudness, 10_400)).toBe(10_500)
  })

  /*
   * Real audio has a noise floor: a room tone, a preamp hiss. Nothing is
   * ever exactly zero, so "quiet" has to mean quiet *for this recording*.
   */
  it('finds the gap in a recording with a noisy floor', () => {
    const loudness = profile(['loud', 10_000], ['quiet', 1_000], ['loud', 10_000]).map(
      (level) => level * 0.4 + 0.08,
    )

    expect(cut(loudness, 12_000)).toBeLessThan(11_500)
  })

  it.each([[[]], [[1]], [[0]]])('survives a profile of %j', (loudness) => {
    expect(cut(loudness, 0)).toBe(0)
  })

  /*
   * A real episode, not a fixture. Two hours at 20 ms frames is 360 000
   * entries, and the first version measured the peak with
   * `Math.max(...loudness)` — which passed every short test above and threw
   * "Maximum call stack size exceeded" on anything of a realistic length.
   * It would have failed on the first upload and on none of the tests.
   */
  it('handles a two-hour profile without overflowing the stack', () => {
    const twoHours = Array.from({ length: (2 * 60 * 60_000) / FRAME_MS }, (_, frame) =>
      // A gap on every minute, so there is something to find as well.
      ((frame * FRAME_MS) % 60_000) >= 59_000 ? 0 : 1,
    )

    expect(twoHours).toHaveLength(360_000)
    expect(() => cut(twoHours, 72 * 60_000)).not.toThrow()
    expect(cut(twoHours, 72 * 60_000) % 60_000).toBeGreaterThanOrEqual(59_000)
  })
})
