import { sql } from 'drizzle-orm'
import { isTheScheduler } from '../../../server/cron-caller.js'
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
 */
export async function GET(request: Request): Promise<Response> {
  if (!isTheScheduler(request.headers.get('authorization'), process.env['CRON_SECRET'])) {
    return Response.json({ error: 'NOT_SIGNED_IN' }, { status: 401 })
  }

  try {
    await database().execute(sql`select 1`)
    return Response.json({ awake: true })
  } catch (error) {
    console.error('could not reach the database to keep it awake', error)
    return Response.json({ error: 'UNEXPECTED' }, { status: 500 })
  }
}
