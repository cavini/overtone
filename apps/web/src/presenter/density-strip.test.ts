// US-016 · when in the episode a running joke clustered
import { describe, expect, it } from 'vitest'
import { BANDS, densityStrip } from './density-strip.js'

const at = (...starts: readonly number[]) => starts.map((startMs) => ({ startMs }))

/** A ten-minute episode, cut into ten slices of a minute each. */
const TEN_MINUTES = 600_000
const strip = (mentions: readonly { startMs: number }[]) =>
  densityStrip(mentions, TEN_MINUTES, 10)

describe('densityStrip', () => {
  it('puts a mention in the slice it was said in', () => {
    expect(strip(at(0)).map((band) => band.count)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(strip(at(5 * 60_000)).map((band) => band.count)).toEqual([
      0, 0, 0, 0, 0, 1, 0, 0, 0, 0,
    ])
  })

  it('shows a cluster as a cluster', () => {
    const clustered = strip(at(60_000, 65_000, 70_000, 110_000))

    expect(clustered[1]?.count).toBe(4)
    expect(clustered[1]?.heat).toBe(100)
  })

  /*
   * Scaled against the topic's own busiest slice. One shared scale would
   * flatten every quiet running joke into a line along the bottom, and the
   * question each strip answers is about itself.
   */
  it('scales each topic against its own busiest slice', () => {
    const quiet = strip(at(0, 60_000, 60_001))
    const loud = strip([...at(0), ...Array.from({ length: 50 }, () => ({ startMs: 60_000 }))])

    expect(quiet[0]?.heat).toBe(50)
    expect(loud[0]?.heat).toBe(2)
    expect(quiet[1]?.heat).toBe(loud[1]?.heat)
  })

  it('says when each slice starts, so a label can read as a clock', () => {
    expect(strip(at()).map((band) => band.startMs)).toEqual([
      0, 60_000, 120_000, 180_000, 240_000, 300_000, 360_000, 420_000, 480_000, 540_000,
    ])
  })

  // A mention exactly on the end would index one past the last slice, and a
  // timestamp past the end is a bug somewhere else rather than a reason to
  // throw here.
  it.each([TEN_MINUTES, TEN_MINUTES + 5_000])('keeps a mention at %o inside the strip', (when) => {
    const edge = strip(at(when))

    expect(edge).toHaveLength(10)
    expect(edge.at(-1)?.count).toBe(1)
  })

  it('ignores a mention before the beginning rather than dropping off the front', () => {
    expect(strip(at(-1_000))[0]?.count).toBe(1)
  })

  it('is all cold for a joke that never came up', () => {
    expect(strip(at()).every((band) => band.count === 0 && band.heat === 0)).toBe(true)
  })

  /*
   * An episode still being processed has no duration yet, and a strip drawn
   * across nothing would be a confident picture of no information.
   */
  it.each([0, -1])('draws nothing for an episode of length %o', (durationMs) => {
    expect(densityStrip(at(0), durationMs)).toEqual([])
  })

  it('draws the number of slices it was asked for', () => {
    expect(densityStrip(at(0), TEN_MINUTES)).toHaveLength(BANDS)
  })
})
