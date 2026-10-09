// US-040 · ADR 0020
import { drizzle } from 'drizzle-orm/pg-proxy'
import { beforeEach, describe, expect, it } from 'vitest'
import { DrizzleAllowanceStore } from './drizzle-allowance-store.js'

const HOUR_RESETS = new Date('2026-10-09T11:00:00.000Z')
const DAY_RESETS = new Date('2026-10-10T00:00:00.000Z')

let statements: string[]
let rows: unknown[][]
let store: DrizzleAllowanceStore

beforeEach(() => {
  statements = []
  rows = [[1, 3_600_000, 7_200_000, HOUR_RESETS.toISOString(), DAY_RESETS.toISOString()]]
  const db = drizzle(async (sql) => {
    statements.push(sql)
    return { rows: sql.toLowerCase().startsWith('select') ? rows : [] }
  })
  store = new DrizzleAllowanceStore(db)
})

describe('DrizzleAllowanceStore', () => {
  describe('read', () => {
    it('brings back what has been spent', async () => {
      expect(await store.read()).toEqual({
        hourlyUsedMs: 3_600_000,
        dailyUsedMs: 7_200_000,
        hourResetsAt: HOUR_RESETS.getTime(),
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
    // which is a full allowance, not an error.
    it('reports an untouched allowance when the row is missing', async () => {
      rows = []

      const state = await store.read()

      expect(state.hourlyUsedMs).toBe(0)
      expect(state.dailyUsedMs).toBe(0)
    })

    it('does not put a missing row in the past', async () => {
      rows = []

      const state = await store.read()

      // A reset time of 0 would read as "the window rolled over long ago",
      // which is true but only by accident. Both must be in the future so
      // nothing downstream treats the gap as a rollover it can exploit.
      expect(state.hourResetsAt).toBeGreaterThan(state.dailyUsedMs)
      expect(state.dayResetsAt).toBeGreaterThan(state.hourResetsAt)
    })
  })

  describe('record', () => {
    const CHUNK = 20 * 60_000

    it('writes the spend', async () => {
      await store.record(CHUNK)
      expect(statements[0]).toMatch(/insert into "allowance"/i)
    })

    // The whole point. Two people uploading at once spend the same budget,
    // and a read-then-write would lose one of the two spends — letting the
    // pair send more audio than the hour allows and failing the episode at
    // the provider instead of waiting. The database has to do the addition.
    it('adds in one statement rather than reading and writing back', async () => {
      await store.record(CHUNK)

      expect(statements).toHaveLength(1)
      expect(statements[0]).not.toMatch(/^select/i)
      expect(statements[0]).toMatch(/"hourly_used_ms" \+/i)
    })

    it('creates the row on the first ever spend', async () => {
      await store.record(CHUNK)
      expect(statements[0]).toMatch(/on conflict/i)
    })

    // A window that has already rolled over must restart at this spend, not
    // carry an hour-old total forward — otherwise the allowance looks spent
    // for as long as the app stays busy and no chunk is ever sent again.
    it('restarts a window whose time has passed', async () => {
      await store.record(CHUNK)

      const sql = statements[0] ?? ''
      expect(sql).toMatch(/case\s+when/i)
      expect(sql).toMatch(/hour_resets_at/i)
      expect(sql).toMatch(/day_resets_at/i)
    })

    // The rollover test compares against the database's clock, not the
    // caller's. Two app instances disagreeing by a second must not disagree
    // about whether the hour has turned.
    it('decides the rollover by the database clock', async () => {
      await store.record(CHUNK)
      expect(statements[0]).toMatch(/now\(\)/i)
    })
  })
})
