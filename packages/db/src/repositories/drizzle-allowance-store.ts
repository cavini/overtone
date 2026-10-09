import type { AllowanceState, AllowanceStore } from '@overtone/core'
import { eq, sql } from 'drizzle-orm'
import type { PgColumn, PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { allowance } from '../schema.js'

type Database = PgDatabase<PgQueryResultHKT, Record<string, unknown>>

/** There is one budget, so there is one row. */
const SHARED_ROW = 1

const HOUR_MS = 60 * 60_000
const DAY_MS = 24 * HOUR_MS

/**
 * The transcription allowance, counted in the database.
 *
 * The free tier counts seconds of audio against one account per hour and per
 * day (ADR 0020), so this is shared state: two people uploading at once are
 * spending the same budget. That makes every read-modify-write a lost-update
 * waiting to happen, which is why `record` is a single statement and the
 * addition is Postgres's, not ours.
 */
export class DrizzleAllowanceStore implements AllowanceStore {
  constructor(private readonly db: Database) {}

  async read(): Promise<AllowanceState> {
    const [row] = await this.db
      .select()
      .from(allowance)
      .where(eq(allowance.id, SHARED_ROW))
      .limit(1)

    // No row yet means nothing has ever been transcribed, which is a full
    // allowance rather than a problem. The windows are placed in the future
    // so nothing downstream reads the gap as a rollover it can spend twice.
    if (!row) {
      const now = Date.now()
      return {
        hourlyUsedMs: 0,
        dailyUsedMs: 0,
        hourResetsAt: now + HOUR_MS,
        dayResetsAt: now + DAY_MS,
      }
    }

    return {
      hourlyUsedMs: row.hourlyUsedMs,
      dailyUsedMs: row.dailyUsedMs,
      hourResetsAt: row.hourResetsAt.getTime(),
      dayResetsAt: row.dayResetsAt.getTime(),
    }
  }

  async record(audioMs: number): Promise<void> {
    // One statement, and the arithmetic belongs to the database.
    //
    // Each window either restarts at this spend, if its time has passed, or
    // grows by it. Both branches are decided by `now()` — the database's
    // clock — so two app instances whose clocks disagree by a second cannot
    // disagree about whether the hour has turned.
    const rolledOver = (resetsAt: PgColumn) => sql`${resetsAt} <= now()`

    await this.db
      .insert(allowance)
      .values({
        id: SHARED_ROW,
        hourlyUsedMs: audioMs,
        dailyUsedMs: audioMs,
        hourResetsAt: sql`now() + interval '1 hour'`,
        dayResetsAt: sql`now() + interval '1 day'`,
      })
      .onConflictDoUpdate({
        target: allowance.id,
        set: {
          hourlyUsedMs: sql`case when ${rolledOver(allowance.hourResetsAt)}
            then ${audioMs} else ${allowance.hourlyUsedMs} + ${audioMs} end`,
          dailyUsedMs: sql`case when ${rolledOver(allowance.dayResetsAt)}
            then ${audioMs} else ${allowance.dailyUsedMs} + ${audioMs} end`,
          hourResetsAt: sql`case when ${rolledOver(allowance.hourResetsAt)}
            then now() + interval '1 hour' else ${allowance.hourResetsAt} end`,
          dayResetsAt: sql`case when ${rolledOver(allowance.dayResetsAt)}
            then now() + interval '1 day' else ${allowance.dayResetsAt} end`,
        },
      })
  }
}
