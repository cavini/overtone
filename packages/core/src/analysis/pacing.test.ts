// US-040 · ADR 0020, ADR 0021
import { describe, expect, it } from 'vitest'
import {
  DECODE_BUDGET_BYTES,
  MAX_EPISODE_MS,
  decodedBytesFor,
} from '../domain/episode-length.js'
import type { AllowanceState } from '../domain/allowance.js'
import type { AudioChunk } from '../domain/audio-chunk.js'
import { ALLOWANCE_REFILL_RATE } from '../domain/observed-allowance.js'
import { planChunks } from './chunking.js'
import {
  balanceAt,
  DAILY_ALLOWANCE_MS,
  HOURLY_ALLOWANCE_MS,
  nextChunkToSend,
} from './pacing.js'

const NOW = Date.parse('2026-10-09T09:00:00.000Z')
const MINUTE = 60_000

/** A real episode: 2 h 06 m 31 s, the one the provider refused as a whole. */
const EPISODE_MS = 7_591_000
const PLAN = planChunks(EPISODE_MS)

const full = (over: Partial<AllowanceState> = {}): AllowanceState => ({
  remainingAudioMs: HOURLY_ALLOWANCE_MS,
  asOfMs: NOW,
  dailyUsedMs: 0,
  dayResetsAt: NOW + 24 * 60 * MINUTE,
  ...over,
})

const chunk = (startMs: number, endMs: number): AudioChunk[] => [{ index: 0, startMs, endMs }]

describe('nextChunkToSend', () => {
  it('sends the first chunk when the balance is full', () => {
    expect(nextChunkToSend(PLAN, [], full(), NOW)).toEqual({ send: true, chunk: PLAN[0] })
  })

  it('works through the chunks in order', () => {
    expect(nextChunkToSend(PLAN, [0], full(), NOW)).toMatchObject({ chunk: { index: 1 } })
  })

  it('sends a chunk that was skipped over, not just the newest', () => {
    expect(nextChunkToSend(PLAN, [0, 2, 3], full(), NOW)).toMatchObject({ chunk: { index: 1 } })
  })

  it('reports the episode finished when every chunk is done', () => {
    const everyIndex = PLAN.map((c) => c.index)
    expect(nextChunkToSend(PLAN, everyIndex, full(), NOW)).toEqual({ send: false, reason: 'COMPLETE' })
  })

  it('finds nothing to do for an episode with no chunks', () => {
    expect(nextChunkToSend([], [], full(), NOW)).toEqual({ send: false, reason: 'COMPLETE' })
  })

  describe('waiting on the hourly balance', () => {
    it('holds a chunk the balance cannot afford', () => {
      const twentyMinutes = chunk(0, 20 * MINUTE)
      const decision = nextChunkToSend(twentyMinutes, [], full({ remainingAudioMs: 60_000 }), NOW)

      expect(decision).toMatchObject({ send: false, reason: 'HOURLY_ALLOWANCE_EXHAUSTED' })
    })

    // The point of ADR 0021. The old model waited for the bucket to refill
    // completely, which on this episode's 391-second tail meant 54 minutes
    // for audio that needs 196 seconds of refill.
    it('waits only long enough to afford this chunk, not to refill the bucket', () => {
      const tail = chunk(0, 391_000)
      const decision = nextChunkToSend(tail, [], full({ remainingAudioMs: 0 }), NOW)

      expect(decision).toMatchObject({
        send: false,
        retryAfterMs: 391_000 / ALLOWANCE_REFILL_RATE,
      })
      // Minutes, not the better part of an hour.
      expect((decision as { retryAfterMs: number }).retryAfterMs).toBeLessThan(4 * MINUTE)
    })

    it('asks for only the shortfall when the balance is partway there', () => {
      const twentyMinutes = chunk(0, 20 * MINUTE)
      const decision = nextChunkToSend(
        twentyMinutes,
        [],
        full({ remainingAudioMs: 20 * MINUTE - 100_000 }),
        NOW,
      )

      expect(decision).toMatchObject({ retryAfterMs: 100_000 / ALLOWANCE_REFILL_RATE })
    })

    it('sends once enough has refilled', () => {
      const twentyMinutes = chunk(0, 20 * MINUTE)
      const drained = full({ remainingAudioMs: 0 })
      const needed = (20 * MINUTE) / ALLOWANCE_REFILL_RATE

      expect(nextChunkToSend(twentyMinutes, [], drained, NOW + needed - 1)).toMatchObject({ send: false })
      expect(nextChunkToSend(twentyMinutes, [], drained, NOW + needed)).toMatchObject({ send: true })
    })

    it('fits a chunk into exactly the balance left', () => {
      const twentyMinutes = chunk(0, 20 * MINUTE)
      const exact = full({ remainingAudioMs: 20 * MINUTE })

      expect(nextChunkToSend(twentyMinutes, [], exact, NOW)).toMatchObject({ send: true })
    })

    // A wait rounded down comes back a millisecond early, gets refused, and
    // costs a whole round trip to learn nothing.
    it('rounds the wait up', () => {
      const odd = chunk(0, 1)
      const decision = nextChunkToSend(odd, [], full({ remainingAudioMs: 0 }), NOW)

      expect(decision).toMatchObject({ retryAfterMs: 1 })
    })

    it('never reports a negative wait', () => {
      const twentyMinutes = chunk(0, 20 * MINUTE)
      const stale = full({ remainingAudioMs: 0, asOfMs: NOW - 10 * 60 * MINUTE })

      const decision = nextChunkToSend(twentyMinutes, [], stale, NOW)

      // Ten hours of refill against a 20-minute chunk: affordable, and the
      // long-stale reading must not produce a wait at all.
      expect(decision).toMatchObject({ send: true })
    })
  })

  describe('waiting on the daily allowance', () => {
    const spentForTheDay = full({ dailyUsedMs: DAILY_ALLOWANCE_MS })

    // Telling someone to come back in three minutes when the real answer is
    // tomorrow is worse than telling them nothing.
    it('reports the day rather than the hour when both are spent', () => {
      const decision = nextChunkToSend(
        PLAN,
        [],
        full({ dailyUsedMs: DAILY_ALLOWANCE_MS, remainingAudioMs: 0 }),
        NOW,
      )

      expect(decision).toMatchObject({ send: false, reason: 'DAILY_ALLOWANCE_EXHAUSTED' })
    })

    it('says how long until the day turns over', () => {
      const decision = nextChunkToSend(PLAN, [], spentForTheDay, NOW)

      expect(decision).toMatchObject({ retryAfterMs: spentForTheDay.dayResetsAt - NOW })
    })

    it('holds a chunk that would overrun the day even with a full balance', () => {
      const decision = nextChunkToSend(
        PLAN,
        [],
        full({ dailyUsedMs: DAILY_ALLOWANCE_MS - 60_000 }),
        NOW,
      )

      expect(decision).toMatchObject({ send: false, reason: 'DAILY_ALLOWANCE_EXHAUSTED' })
    })

    it('ignores a daily tally whose window has already turned over', () => {
      const yesterday = full({ dailyUsedMs: DAILY_ALLOWANCE_MS, dayResetsAt: NOW - 1 })

      expect(nextChunkToSend(PLAN, [], yesterday, NOW)).toMatchObject({ send: true })
    })
  })

  it('is deterministic', () => {
    const once = nextChunkToSend(PLAN, [1, 2], full(), NOW)
    expect(nextChunkToSend(PLAN, [1, 2], full(), NOW)).toEqual(once)
  })
})

describe('balanceAt', () => {
  it('adds the refill since the reading', () => {
    expect(balanceAt(full({ remainingAudioMs: 0 }), NOW + 1000)).toBe(2000)
  })

  // Otherwise an app left idle overnight would believe it had ten hours of
  // audio in hand and fail the first episode of the morning at the provider.
  it('never exceeds the bucket, however long it has been idle', () => {
    expect(balanceAt(full({ remainingAudioMs: 0 }), NOW + 24 * 60 * MINUTE)).toBe(HOURLY_ALLOWANCE_MS)
  })

  // Two machines whose clocks disagree by a second must not make the balance
  // smaller than what was actually reported.
  it('does not subtract refill for a reading stamped in the future', () => {
    expect(balanceAt(full({ remainingAudioMs: 1000, asOfMs: NOW + 5000 }), NOW)).toBe(1000)
  })
})

describe('the allowances themselves', () => {
  it('match the free tier the service actually enforces', () => {
    // From the refusal in docs/experiments/0002 and the headers in 0003.
    expect(HOURLY_ALLOWANCE_MS).toBe(7_200 * 1000)
    expect(DAILY_ALLOWANCE_MS).toBe(28_800 * 1000)
  })

  it("is smaller than one of this show's episodes", () => {
    // The whole reason chunking exists: no file size makes this fit.
    expect(EPISODE_MS).toBeGreaterThan(HOURLY_ALLOWANCE_MS)
  })

  it("allows three of this show's episodes in a day, not four", () => {
    expect(Math.floor(DAILY_ALLOWANCE_MS / EPISODE_MS)).toBe(3)
  })

  // The measured refill rate, restated as the thing that actually matters:
  // a full bucket takes an hour to accumulate.
  it('refills a full bucket in an hour', () => {
    expect(HOURLY_ALLOWANCE_MS / ALLOWANCE_REFILL_RATE).toBe(60 * MINUTE)
  })
})

// The headline number in every document, computed rather than asserted by
// hand — the last time it was done by hand it was wrong by a factor of four.
describe('a whole episode', () => {
  it('pays for itself in refill, not in waiting for a reset', () => {
    let waitedMs = 0
    let allowance = full()
    const done: number[] = []

    for (let step = 0; step < PLAN.length * 4 && done.length < PLAN.length; step += 1) {
      const decision = nextChunkToSend(PLAN, done, allowance, NOW + waitedMs)

      if (decision.send) {
        const spent = decision.chunk.endMs - decision.chunk.startMs
        allowance = {
          ...allowance,
          remainingAudioMs: balanceAt(allowance, NOW + waitedMs) - spent,
          asOfMs: NOW + waitedMs,
        }
        done.push(decision.chunk.index)
        continue
      }
      if (decision.reason === 'COMPLETE') break
      waitedMs += decision.retryAfterMs
    }

    expect(done).toHaveLength(PLAN.length)

    // Six 20-minute chunks drain a full bucket exactly; the 391-second tail
    // then needs 195.5 s of refill. That is the whole wait for a 2 h 06 m
    // episode, and it is charged no credit here for the time transcription
    // itself takes — during which the bucket is refilling too.
    expect(waitedMs).toBe(195_500)
    expect(waitedMs).toBeLessThan(4 * MINUTE)
  })

/*
 * Two limits on how long an episode may be, and which of them bites.
 *
 * Here rather than beside `MAX_EPISODE_MS`, because the domain may depend
 * on nothing and cannot see the allowance. Analysis can see both.
 */
describe('the allowance against the browser', () => {
  it('lets the browser refuse first', () => {
    expect(MAX_EPISODE_MS).toBeLessThan(DAILY_ALLOWANCE_MS)
  })

  /*
   * The length the allowance used to permit, which is what the check
   * actually compared against: eight hours is about 5.5 GB at the peak of
   * the decode. Not a slow upload — the tab disappears, with nothing said.
   */
  it('would have let through an episode no tab can hold', () => {
    expect(decodedBytesFor(DAILY_ALLOWANCE_MS)).toBeGreaterThan(DECODE_BUDGET_BYTES * 2)
  })
})
})
