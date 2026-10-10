// US-041 · an upload that never finished arriving
import { describe, expect, it } from 'vitest'
import { isAbandoned, UPLOAD_GRACE_MS } from './abandoned.js'

const NOW = 1_700_000_000_000

describe('isAbandoned', () => {
  /*
   * The episode's row is written *before* its chunks are uploaded, so a
   * scheduled run firing in that gap sees audio that has not arrived yet.
   * Giving up there kills a perfectly good upload.
   */
  it('waits on an upload that only just started', () => {
    expect(isAbandoned(NOW, NOW)).toBe(false)
  })

  it('still waits while a long upload is plausibly in flight', () => {
    expect(isAbandoned(NOW - UPLOAD_GRACE_MS + 1_000, NOW)).toBe(false)
  })

  /*
   * And the other direction. The scheduler takes the oldest unfinished
   * episode every minute, so one that can never finish sits at the head of
   * the queue forever and starves everything behind it.
   */
  it('gives up once the wait is over', () => {
    expect(isAbandoned(NOW - UPLOAD_GRACE_MS - 1_000, NOW)).toBe(true)
  })

  it('is generous enough for a two-hour episode on a domestic connection', () => {
    // Ten chunks of twenty-odd megabytes. Half an hour is longer than that
    // takes on anything but the worst link.
    expect(UPLOAD_GRACE_MS).toBeGreaterThanOrEqual(20 * 60_000)
  })

  it('does not give up on an episode from the future', () => {
    expect(isAbandoned(NOW + 60_000, NOW)).toBe(false)
  })
})
