// The browser decodes the whole episode before it cuts anything, so the
// binding limit on length is a tab's memory — and it binds long before the
// allowance does.
import { describe, expect, it } from 'vitest'
import { DECODE_BUDGET_BYTES, MAX_EPISODE_MS, decodedBytesFor } from './episode-length.js'

const minutes = (n: number): number => n * 60_000

describe('how long an episode may be', () => {
  it('fits what the longest allowed episode costs to decode', () => {
    expect(decodedBytesFor(MAX_EPISODE_MS)).toBeLessThanOrEqual(DECODE_BUDGET_BYTES)
  })

  // The show runs 1 h 40 m to 2 h, so the limit has to clear that without
  // argument or it is the wrong limit.
  it('leaves the show its own length, with room', () => {
    expect(MAX_EPISODE_MS).toBeGreaterThan(minutes(125))
  })

  /*
   * How this compares with the *allowance* is asserted in
   * `pacing.test.ts` instead: the domain is the innermost layer and may
   * depend on nothing, so it cannot see a number that lives in analysis —
   * which dependency-cruiser pointed out the moment this test tried.
   */

  it('counts the mixdown as well as the buffer it is mixed from', () => {
    // A stereo decode plus the mono copy: three channels' worth, not one.
    expect(decodedBytesFor(1_000)).toBe(16_000 * 4 * 3)
  })
})
