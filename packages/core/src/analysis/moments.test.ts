// US-047
import { describe, expect, it } from 'vitest'
import { groupIntoMoments, MOMENT_GAP_MS } from './moments.js'

const hit = (startMs: number, endMs = startMs + 3_000) => ({ startMs, endMs })

describe('groupIntoMoments', () => {
  /*
   * Five hits inside one conversation are one answer, not five.
   *
   * Segments are about three seconds long, so a stretch where they actually
   * talked about something produces a cluster of them. Listing each
   * separately buries the real answer — "they discussed it here, at length"
   * — under a list of near-identical timestamps.
   */
  it('gathers a cluster into one moment', () => {
    const moment = groupIntoMoments([hit(0), hit(4_000), hit(9_000)])

    expect(moment).toHaveLength(1)
    expect(moment[0]).toMatchObject({ startMs: 0, endMs: 12_000, hitCount: 3 })
  })

  it('keeps separate conversations separate', () => {
    const moments = groupIntoMoments([hit(0), hit(600_000)])

    expect(moments).toHaveLength(2)
    expect(moments.map((m) => m.startMs)).toEqual([0, 600_000])
  })

  it('splits exactly at the gap, not around it', () => {
    const together = groupIntoMoments([hit(0, 1_000), hit(1_000 + MOMENT_GAP_MS)])
    const apart = groupIntoMoments([hit(0, 1_000), hit(1_001 + MOMENT_GAP_MS)])

    expect(together).toHaveLength(1)
    expect(apart).toHaveLength(2)
  })

  // The thing someone is actually looking for is the stretch they talked
  // about it most, not the first time the word slipped out.
  it('puts the longest discussion first', () => {
    const moments = groupIntoMoments([
      hit(0),
      hit(600_000),
      hit(604_000),
      hit(608_000),
    ])

    expect(moments[0]).toMatchObject({ startMs: 600_000, hitCount: 3 })
    expect(moments[1]).toMatchObject({ startMs: 0, hitCount: 1 })
  })

  it('breaks a tie by when it happened', () => {
    const moments = groupIntoMoments([hit(600_000), hit(0)])

    expect(moments.map((m) => m.startMs)).toEqual([0, 600_000])
  })

  it('does not care what order the hits arrive in', () => {
    const forwards = groupIntoMoments([hit(0), hit(4_000), hit(600_000)])
    const backwards = groupIntoMoments([hit(600_000), hit(4_000), hit(0)])

    expect(backwards).toEqual(forwards)
  })

  it('finds nothing in nothing', () => {
    expect(groupIntoMoments([])).toEqual([])
  })

  it('reports a single hit as a moment of its own', () => {
    expect(groupIntoMoments([hit(5_000, 8_000)])).toEqual([
      { startMs: 5_000, endMs: 8_000, hitCount: 1 },
    ])
  })

  // Overlapping hits come from one word matching two adjacent segments; the
  // moment should still read as one span rather than going backwards.
  it('never ends a moment before it starts', () => {
    for (const moment of groupIntoMoments([hit(10_000, 20_000), hit(12_000, 15_000)])) {
      expect(moment.endMs).toBeGreaterThanOrEqual(moment.startMs)
    }
  })
})

describe('the gap itself', () => {
  // Long enough to hold a digression and come back; short enough that two
  // genuinely separate conversations do not merge into one.
  it('is a conversational pause, not a scene change', () => {
    expect(MOMENT_GAP_MS).toBeGreaterThanOrEqual(30_000)
    expect(MOMENT_GAP_MS).toBeLessThanOrEqual(180_000)
  })
})
