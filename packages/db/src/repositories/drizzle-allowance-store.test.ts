// US-040 · ADR 0020, ADR 0021
import { HOURLY_ALLOWANCE_MS, type ObservedAllowance } from '@overtone/core'
import { drizzle } from 'drizzle-orm/pg-proxy'
import { beforeEach, describe, expect, it } from 'vitest'
import { DrizzleAllowanceStore } from './drizzle-allowance-store.js'

const AS_OF = new Date('2026-10-09T10:30:00.000Z')
const DAY_RESETS = new Date('2026-10-10T00:00:00.000Z')

let statements: string[]
let rows: unknown[][]
let store: DrizzleAllowanceStore

beforeEach(() => {
  statements = []
  rows = [[1, 6_300_000, AS_OF.toISOString(), 7_200_000, DAY_RESETS.toISOString()]]
  const db = drizzle(async (sql) => {
    statements.push(sql)
    return { rows: sql.toLowerCase().startsWith('select') ? rows : [] }
  })
  store = new DrizzleAllowanceStore(db)
})

describe('DrizzleAllowanceStore', () => {
  describe('read', () => {
    it('brings back the balance and when it was true', async () => {
      expect(await store.read()).toEqual({
        remainingAudioMs: 6_300_000,
        asOfMs: AS_OF.getTime(),
        dailyUsedMs: 7_200_000,
        dayResetsAt: DAY_RESETS.getTime(),
      })
    })

    it('reads the one shared row', async () => {
      await store.read()
      // One account, one budget. Not per-user and not per-episode.
      expect(statements[0]).toMatch(/where/i)
      expect(statements[0]).toMatch(/limit/i)
    })

    // Before the first upload the row does not exist. Nothing has been spent,
    // which is a full bucket, not an error.
    it('reports a full bucket when the row is missing', async () => {
      rows = []

      const state = await store.read()

      expect(state.remainingAudioMs).toBe(HOURLY_ALLOWANCE_MS)
      expect(state.dailyUsedMs).toBe(0)
    })

    it('stamps a missing row as true now, not at the epoch', async () => {
      rows = []

      // An `asOfMs` of 0 would credit fifty-six years of refill. It is
      // clamped at the bucket size downstream, so the balance survives, but
      // the reading would be a lie and the next thing to use it might not
      // clamp.
      const before = Date.now()
      const state = await store.read()

      expect(state.asOfMs).toBeGreaterThanOrEqual(before)
      expect(state.asOfMs).toBeLessThanOrEqual(Date.now())
    })
  })

  describe('record', () => {
    const CHUNK = 20 * 60_000
    const OBSERVED: ObservedAllowance = {
      remainingAudioMs: 5_473_000,
      limitAudioMs: HOURLY_ALLOWANCE_MS,
      refillsFullyInMs: 863_500,
    }

    it('writes the spend', async () => {
      await store.record(CHUNK)
      expect(statements[0]).toMatch(/insert into "allowance"/i)
    })

    // The whole point of doing this in SQL. Two people uploading at once
    // spend the same budget, and a read-then-write would lose one of the two
    // — letting the pair send more audio than the balance allows and failing
    // the episode at the provider instead of waiting.
    it('works in one statement rather than reading and writing back', async () => {
      await store.record(CHUNK)

      expect(statements).toHaveLength(1)
      expect(statements[0]).not.toMatch(/^select/i)
    })

    it('creates the row on the first ever spend', async () => {
      await store.record(CHUNK)
      expect(statements[0]).toMatch(/on conflict/i)
    })

    describe('without a reading from the provider', () => {
      // Our own arithmetic: credit the refill since the last reading, then
      // debit what was sent. Skipping the refill would make the balance drift
      // ever lower and eventually stall the pipeline on a budget that is
      // actually full.
      it('credits the refill before debiting the spend', async () => {
        await store.record(CHUNK)

        const sql = statements[0] ?? ''
        expect(sql).toMatch(/extract\(epoch from/i)
        expect(sql).toMatch(/"as_of"/i)
      })

      it('clamps the balance to the bucket and to zero', async () => {
        await store.record(CHUNK)

        const sql = statements[0] ?? ''
        expect(sql).toMatch(/least/i)
        expect(sql).toMatch(/greatest/i)
      })
    })

    describe('with a reading from the provider', () => {
      // The provider knows its own balance; we are guessing. Where the two
      // disagree, ours is wrong (ADR 0021).
      it('takes the reported balance instead of subtracting', async () => {
        await store.record(CHUNK, OBSERVED)

        const sql = statements[0] ?? ''
        expect(sql).not.toMatch(/extract\(epoch from/i)
      })

      it('still counts the spend against the day', async () => {
        await store.record(CHUNK, OBSERVED)
        // The provider does not report a daily figure, so that tally stays
        // ours whatever it says about the hour.
        expect(statements[0]).toMatch(/"daily_used_ms"/i)
      })
    })

    // A window already past must restart at this spend, not carry a
    // day-old total forward.
    it('restarts the day when its window has passed', async () => {
      await store.record(CHUNK)

      const sql = statements[0] ?? ''
      expect(sql).toMatch(/case\s+when/i)
      expect(sql).toMatch(/day_resets_at/i)
    })

    it('decides the rollover by the database clock', async () => {
      await store.record(CHUNK)
      expect(statements[0]).toMatch(/now\(\)/i)
    })
  })
})
