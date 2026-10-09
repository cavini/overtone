import {
  ALLOWANCE_REFILL_RATE,
  HOURLY_ALLOWANCE_MS,
  type AllowanceState,
  type AllowanceStore,
  type ObservedAllowance,
} from '@overtone/core'
import { eq, sql, type SQL } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { allowance } from '../schema.js'

type Database = PgDatabase<PgQueryResultHKT, Record<string, unknown>>

/** There is one budget, so there is one row. */
const SHARED_ROW = 1

/** Refill per second of wall clock, in milliseconds of audio. */
const REFILL_PER_SECOND = ALLOWANCE_REFILL_RATE * 1_000

/**
 * The transcription allowance, counted in the database.
 *
 * The free tier counts seconds of audio against one account (ADR 0020), so
 * this is shared state: two people uploading at once are spending the same
 * budget. That makes every read-modify-write a lost update waiting to happen,
 * which is why `record` is a single statement and the arithmetic is
 * Postgres's, not ours.
 *
 * And where the provider has told us its own balance, there is no arithmetic
 * to do — we store what it said (ADR 0021).
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
    // bucket rather than a problem.
    if (!row) {
      return {
        remainingAudioMs: HOURLY_ALLOWANCE_MS,
        asOfMs: Date.now(),
        dailyUsedMs: 0,
        dayResetsAt: Date.now() + 86_400_000,
      }
    }

    return {
      remainingAudioMs: row.remainingAudioMs,
      asOfMs: row.asOf.getTime(),
      dailyUsedMs: row.dailyUsedMs,
      dayResetsAt: row.dayResetsAt.getTime(),
    }
  }

  async record(spentAudioMs: number, observed?: ObservedAllowance): Promise<void> {
    // One statement, and the arithmetic belongs to the database. Both
    // branches are decided by `now()` — the database's clock — so two app
    // instances whose clocks disagree cannot disagree about the balance.
    const balance: SQL = observed
      ? // Nothing to compute. The provider knows; we were guessing.
        sql`${observed.remainingAudioMs}`
      : // Credit the refill since the last reading, then debit what was sent.
        // Without the refill the balance would drift ever lower and stall the
        // pipeline on a budget that is actually full.
        sql`greatest(0, least(
          ${HOURLY_ALLOWANCE_MS},
          ${allowance.remainingAudioMs}
            + extract(epoch from (now() - ${allowance.asOf})) * ${REFILL_PER_SECOND}
        ) - ${spentAudioMs})`

    const dayRolledOver = sql`${allowance.dayResetsAt} <= now()`

    await this.db
      .insert(allowance)
      .values({
        id: SHARED_ROW,
        // Clamped, because a spend can exceed a full bucket: the provider
        // refuses it, but the refusal still has to leave a sane balance
        // behind. Not clamped *upward* against our own constant — if the
        // provider raises its limit, its figure is the authority (ADR 0021).
        remainingAudioMs:
          observed?.remainingAudioMs ?? Math.max(0, HOURLY_ALLOWANCE_MS - spentAudioMs),
        asOf: sql`now()`,
        dailyUsedMs: spentAudioMs,
        dayResetsAt: sql`now() + interval '1 day'`,
      })
      .onConflictDoUpdate({
        target: allowance.id,
        set: {
          remainingAudioMs: balance,
          asOf: sql`now()`,
          dailyUsedMs: sql`case when ${dayRolledOver}
            then ${spentAudioMs} else ${allowance.dailyUsedMs} + ${spentAudioMs} end`,
          dayResetsAt: sql`case when ${dayRolledOver}
            then now() + interval '1 day' else ${allowance.dayResetsAt} end`,
        },
      })
  }
}
