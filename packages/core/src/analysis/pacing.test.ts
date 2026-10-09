// US-043 · ADR 0020
import { describe, expect, it } from 'vitest'
import { DAILY_ALLOWANCE_MS, HOURLY_ALLOWANCE_MS, nextChunkToSend } from './pacing.js'
import { CHUNK_TARGET_MS, planChunks } from './chunking.js'

const NOW = 1_800_000_000_000
const hours = (n: number) => n * 3_600_000

/** The show's real episode: 2 h 06 m 31 s, seven chunks. */
const EPISODE = planChunks(7_591_000)

const allowance = (
  overrides: {
    hourlyUsedMs?: number
    dailyUsedMs?: number
    hourResetsAt?: number
    dayResetsAt?: number
  } = {},
) => ({
  hourlyUsedMs: overrides.hourlyUsedMs ?? 0,
  dailyUsedMs: overrides.dailyUsedMs ?? 0,
  hourResetsAt: overrides.hourResetsAt ?? NOW + hours(1),
  dayResetsAt: overrides.dayResetsAt ?? NOW + hours(6),
})

describe('nextChunkToSend', () => {
  it('sends the first chunk when nothing has been spent', () => {
    expect(nextChunkToSend(EPISODE, [], allowance(), NOW)).toEqual({
      send: true,
      chunk: EPISODE[0],
    })
  })

  it('works through the chunks in order', () => {
    const decision = nextChunkToSend(EPISODE, [0, 1, 2], allowance(), NOW)
    expect(decision).toEqual({ send: true, chunk: EPISODE[3] })
  })

  it('reports the episode finished when every chunk is done', () => {
    const all = EPISODE.map((chunk) => chunk.index)
    expect(nextChunkToSend(EPISODE, all, allowance(), NOW)).toEqual({ send: false, reason: 'COMPLETE' })
  })

  it('sends a chunk that was skipped over, not just the newest', () => {
    const decision = nextChunkToSend(EPISODE, [0, 2, 3], allowance(), NOW)
    expect(decision).toEqual({ send: true, chunk: EPISODE[1] })
  })

  describe('waiting on the hourly allowance', () => {
    // The constraint that forced chunking back. Six 20-minute chunks fill an
    // hour exactly, so the seventh always waits.
    it('holds a chunk that will not fit the rest of the hour', () => {
      const decision = nextChunkToSend(
        EPISODE,
        [0, 1, 2, 3, 4, 5],
        allowance({ hourlyUsedMs: CHUNK_TARGET_MS * 6, dailyUsedMs: CHUNK_TARGET_MS * 6 }),
        NOW,
      )

      expect(decision).toEqual({
        send: false,
        reason: 'HOURLY_ALLOWANCE_EXHAUSTED',
        retryAfterMs: hours(1),
      })
    })

    it('says how long until the hour turns over', () => {
      const decision = nextChunkToSend(
        EPISODE,
        [],
        allowance({ hourlyUsedMs: HOURLY_ALLOWANCE_MS, hourResetsAt: NOW + 420_000 }),
        NOW,
      )

      expect(decision).toMatchObject({
        send: false,
        reason: 'HOURLY_ALLOWANCE_EXHAUSTED',
        retryAfterMs: 420_000,
      })
    })

    it('sends again once the hour has turned over', () => {
      const decision = nextChunkToSend(
        EPISODE,
        [0],
        allowance({ hourlyUsedMs: HOURLY_ALLOWANCE_MS, hourResetsAt: NOW - 1 }),
        NOW,
      )

      expect(decision).toMatchObject({ send: true })
    })

    it('fits a chunk into exactly the room left', () => {
      const decision = nextChunkToSend(
        EPISODE,
        [],
        allowance({ hourlyUsedMs: HOURLY_ALLOWANCE_MS - CHUNK_TARGET_MS }),
        NOW,
      )

      expect(decision).toMatchObject({ send: true })
    })
  })

  describe('waiting on the daily allowance', () => {
    // The day is the harder wall, so it is reported in preference to the
    // hour: telling someone to come back in ten minutes when the real answer
    // is tomorrow morning is worse than saying nothing.
    it('reports the day rather than the hour when both are spent', () => {
      const decision = nextChunkToSend(
        EPISODE,
        [],
        allowance({
          hourlyUsedMs: HOURLY_ALLOWANCE_MS,
          dailyUsedMs: DAILY_ALLOWANCE_MS,
          hourResetsAt: NOW + 60_000,
          dayResetsAt: NOW + hours(5),
        }),
        NOW,
      )

      expect(decision).toMatchObject({
        send: false,
        reason: 'DAILY_ALLOWANCE_EXHAUSTED',
        retryAfterMs: hours(5),
      })
    })

    it('holds a chunk that would overrun the day even with hours left in it', () => {
      const decision = nextChunkToSend(
        EPISODE,
        [],
        allowance({ dailyUsedMs: DAILY_ALLOWANCE_MS - 60_000 }),
        NOW,
      )

      expect(decision).toMatchObject({ send: false, reason: 'DAILY_ALLOWANCE_EXHAUSTED' })
    })
  })

  it('finds nothing to do for an episode with no chunks', () => {
    expect(nextChunkToSend([], [], allowance(), NOW)).toEqual({ send: false, reason: 'COMPLETE' })
  })

  // A counter left over from a window that has already turned over says
  // nothing about the current one. Trusting it would stall an episode for an
  // hour over allowance that was handed back long ago.
  it('ignores a spent counter whose window has already turned over', () => {
    const decision = nextChunkToSend(
      EPISODE,
      [],
      allowance({
        hourlyUsedMs: HOURLY_ALLOWANCE_MS,
        dailyUsedMs: DAILY_ALLOWANCE_MS,
        hourResetsAt: NOW - hours(2),
        dayResetsAt: NOW - hours(2),
      }),
      NOW,
    )

    expect(decision).toMatchObject({ send: true })
  })

  it('never reports a negative wait', () => {
    // Spent today, and the clock has drifted past the stored reset.
    const decision = nextChunkToSend(
      EPISODE,
      [],
      {
        hourlyUsedMs: 0,
        dailyUsedMs: DAILY_ALLOWANCE_MS,
        hourResetsAt: NOW + hours(1),
        dayResetsAt: NOW + 1,
      },
      NOW + 5_000,
    )

    if (decision.send || decision.reason === 'COMPLETE') {
      // The day had turned over, which is also a correct answer — then there
      // is no wait to be negative.
      expect(decision.send).toBe(true)
      return
    }

    expect(decision.retryAfterMs).toBeGreaterThanOrEqual(0)
  })

  it('is deterministic', () => {
    const args = [EPISODE, [0, 1], allowance({ hourlyUsedMs: 500_000 }), NOW] as const
    expect(nextChunkToSend(...args)).toEqual(nextChunkToSend(...args))
  })
})

describe('the allowances themselves', () => {
  // Measured from the service's own refusal, not from the documentation:
  // "seconds of audio per hour (ASPH): Limit 7200, Requested 7591".
  it('match the free tier the service actually enforces', () => {
    expect(HOURLY_ALLOWANCE_MS).toBe(7_200_000)
    expect(DAILY_ALLOWANCE_MS).toBe(28_800_000)
  })

  // The whole reason chunking came back.
  it('are smaller than one of this show\'s episodes', () => {
    expect(HOURLY_ALLOWANCE_MS).toBeLessThan(7_591_000)
  })

  it('allow three of this show\'s episodes in a day, not four', () => {
    expect(Math.floor(DAILY_ALLOWANCE_MS / 7_591_000)).toBe(3)
  })
})
