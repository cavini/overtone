import { sql } from 'drizzle-orm'
import { isTheScheduler } from '../../../server/cron-caller.js'
import { sweepOrphanAudio } from '../../../server/sweep-audio.js'
import { database } from '../../../server/wiring.js'

/**
 * Touches the database so Supabase does not put the project to sleep.
 *
 * The free tier pauses a project after seven idle days, and a paused project
 * does not answer — the app would simply be down, on a Tuesday, with nothing
 * deployed and nothing to see in the logs. The group records weekly, so one
 * skipped week or one holiday is all it takes.
 *
 * A real query rather than a health check on the app: what has to stay awake
 * is Postgres, and reaching the web server proves nothing about it.
 *
 * It also sweeps audio belonging to no episode. The same daily slot rather
 * than a second schedule, because Vercel's Hobby plan allows very few and
 * this is housekeeping of exactly the same kind — storage leaks as quietly
 * as a sleeping database, and is noticed just as late.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isTheScheduler(request.headers.get('authorization'), process.env['CRON_SECRET'])) {
    return Response.json({ error: 'NOT_SIGNED_IN' }, { status: 401 })
  }

  try {
    await database().execute(sql`select 1`)

    /*
     * Never allowed to fail the ping.
     *
     * Staying awake is the job; tidying is a bonus. A sweep that threw
     * would stop the database being touched and the project would be
     * paused a week later for a reason buried in a log.
     */
    const swept = await sweepOrphanAudio().catch((error: unknown) => {
      console.error('could not sweep orphaned audio', error)
      return undefined
    })

    return Response.json({ awake: true, ...(swept === undefined ? {} : { audio: swept }) })
  } catch (error) {
    console.error('could not reach the database to keep it awake', error)
    return Response.json({ error: 'UNEXPECTED' }, { status: 500 })
  }
}
