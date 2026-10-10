// US-016 · how a running joke moves across the series
import { describe, expect, it } from 'vitest'
import { topicBars } from './series-bars.js'

const counts = (...pairs: readonly (readonly [number, number])[]) =>
  pairs.map(([episodeNumber, count]) => ({ episodeNumber, count }))

describe('topicBars', () => {
  it('draws the busiest episode full height', () => {
    const [, second] = topicBars(counts([1, 2], [2, 8]))
    expect(second?.height).toBe(100)
  })

  it('scales the rest against it', () => {
    const [first] = topicBars(counts([1, 5], [2, 10]))
    expect(first?.height).toBe(51)
  })

  // A topic scaled against every other topic would leave every row but the
  // loudest as a flat line, and the question each row answers is about
  // itself.
  it('scales each topic against its own busiest episode', () => {
    const quiet = topicBars(counts([1, 1], [2, 2]))
    const loud = topicBars(counts([1, 50], [2, 100]))
    expect(quiet.map((bar) => bar.height)).toEqual(loud.map((bar) => bar.height))
  })

  // A column that vanishes reads as an episode we have no data for. The
  // whole point of the row is that the joke did not come up that week.
  it('keeps a visible stub for an episode it never came up in', () => {
    const [first] = topicBars(counts([1, 0], [2, 4]))
    expect(first?.height).toBeGreaterThan(0)
  })

  it('does not divide by zero for a topic nobody has said', () => {
    expect(topicBars(counts([1, 0], [2, 0])).map((bar) => bar.height)).toEqual([2, 2])
  })

  it('keeps the episode numbers and counts it was given', () => {
    expect(topicBars(counts([7, 3]))[0]).toMatchObject({ episodeNumber: 7, count: 3 })
  })

  it('has nothing to draw for a topic with no episodes', () => {
    expect(topicBars([])).toEqual([])
  })
})
