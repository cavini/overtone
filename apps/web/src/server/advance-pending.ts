import { IN_FLIGHT_STATUSES } from '@overtone/core'
import { episodes } from '@overtone/db/schema'
import { asc, inArray, sql } from 'drizzle-orm'
import { advanceOnce } from './analyse-upload.js'
import { database } from './wiring.js'

/**
 * How long a run may hold the lease.
 *
 * Matched to Vercel's own ceiling on a function, so no run can outlive its
 * lease and two of them can never be working at once. It is also how long a
 * run that dies without releasing wedges the schedule — the lease simply
 * runs out.
 */
const LEASE_SECONDS = 300

/**
 * Runs something with the advance lease held, or not at all.
 *
 * Everything that advances an episode goes through here — the schedule and
 * the open browser tab alike. They are two drivers of one loop, and the
 * thing being protected is global: an allowance of three episodes a day,
 * spent in seconds of audio. Two advances at once transcribe the same chunk
 * twice and pay for it twice.
 *
 * `undefined` means somebody else holds it. The caller decides what that is
 * worth saying.
 */
export async function withAdvanceLease<T>(run: () => Promise<T>): Promise<T | undefined> {
  const db = database()

  /*
   * Claimed with one conditional UPDATE, which is atomic however the
   * connection is pooled.
   *
   * `pg_try_advisory_lock` is the obvious tool and it does not work here:
   * the app speaks to Postgres through the *transaction* pooler, where
   * consecutive statements can land on different backend sessions. Measured
   * — a run took the lock while another connection was holding it, which is
   * precisely the thing the lock was there to stop, failing silently.
   */
  const claimed = await db.execute(
    sql`update advance_lease
           set held_until = now() + make_interval(secs => ${LEASE_SECONDS})
         where held_until < now()
     returning held_until`,
  )
  if (claimed.length === 0) return undefined

  try {
    return await run()
  } finally {
    // Released even if the work threw. Without this a failure costs five
    // minutes of a schedule that fires every one.
    await db.execute(sql`update advance_lease set held_until = now()`)
  }
}

/** What a scheduled run did, for the log and for the test. */
export type AdvanceReport =
  | { readonly did: 'nothing'; readonly because: 'busy' | 'no-episodes' }
  | { readonly did: 'advanced'; readonly episodeId: string; readonly state: string }

/**
 * Moves the oldest unfinished episode one step along.
 *
 * This is what makes an upload survive the tab being closed. The browser
 * splits the audio and uploads the chunks — that part needs the file, so it
 * needs the browser — and from then on the work is paced against an
 * allowance that refills at two audio-seconds per wall-second (ADR 0020),
 * which for a two-hour episode is about an hour of waiting. Asking somebody
 * to leave a tab open for an hour is the thing this product was supposed to
 * avoid.
 *
 * **Under a lease, and that is not optional.** Two runs overlapping would
 * transcribe the same chunk twice and pay for it twice out of a budget of
 * three episodes a day — and the schedule fires every minute, so overlapping
 * is the ordinary case rather than the unlucky one. A run that arrives while
 * another holds the lease does nothing, and the next minute picks it up.
 *
 * One step per run, not a loop. A serverless function has 300 seconds and an
 * episode needs an hour; the schedule is the loop.
 */
export async function advancePending(): Promise<AdvanceReport> {
  const db = database()

  const report = await withAdvanceLease(async (): Promise<AdvanceReport> => {
    const [next] = await db
      .select({ id: episodes.id })
      .from(episodes)
      // Oldest first, so one stuck episode cannot starve the one behind it
      // for longer than it takes to finish.
      .orderBy(asc(episodes.createdAt))
      .where(inArray(episodes.status, [...IN_FLIGHT_STATUSES]))
      .limit(1)

    if (next === undefined) return { did: 'nothing', because: 'no-episodes' }

    const { outcome } = await advanceOnce(next.id)
    return { did: 'advanced', episodeId: next.id, state: outcome.state }
  })

  return report ?? { did: 'nothing', because: 'busy' }
}
