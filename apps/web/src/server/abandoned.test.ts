// US-041 · an upload that never finished arriving
import { describe, expect, it } from 'vitest'
import { isAbandoned, isStalled, STALL_GRACE_MS, UPLOAD_GRACE_MS } from './abandoned.js'

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

/*
 * The other end of the same question, for an episode whose audio is there
 * and whose chunks keep being refused.
 *
 * A transient refusal leaves the episode in `transcribing` so the next run
 * retries it, which is what stops one bad response costing a whole episode.
 * The cost of that is this: a chunk that fails *every* time now holds the
 * head of the queue, because the scheduler takes the oldest in-flight
 * episode, and nothing behind it moves.
 */
describe('isStalled', () => {
  it('does not give up on an episode that just got a chunk in', () => {
    expect(isStalled(NOW, NOW)).toBe(false)
  })

  /*
   * The longest *legitimate* gap between chunks is a daily-allowance wait,
   * which lasts until the day turns over — up to twenty-four hours with no
   * progress at all and nothing wrong. Writing that off would be the
   * original bug again, one layer out, so the grace has to clear it.
   */
  it('clears the longest wait the allowance can impose', () => {
    expect(STALL_GRACE_MS).toBeGreaterThan(24 * 60 * 60_000)
    expect(isStalled(NOW - 24 * 60 * 60_000, NOW)).toBe(false)
  })

  it('gives up once nothing has moved for longer than that', () => {
    expect(isStalled(NOW - STALL_GRACE_MS - 1_000, NOW)).toBe(true)
  })

  // Same reasoning as `isAbandoned`: a clock that disagrees with the
  // database must not be able to write off a healthy episode.
  it('does not give up on progress from the future', () => {
    expect(isStalled(NOW + 60_000, NOW)).toBe(false)
  })
})
