import { advancePending } from '../../../../server/advance-pending.js'
import { isTheScheduler } from '../../../../server/cron-caller.js'

/**
 * The scheduled step that finishes an episode nobody is watching.
 *
 * Called once a minute by `pg_cron` inside Postgres rather than by Vercel,
 * whose Hobby plan allows one cron a day — useful for a keep-alive ping and
 * useless for pacing an episode through an allowance that refills by the
 * second. See `docs/adr/0027`.
 */
/*
 * The same ceiling its sibling `/api/episodes/advance` sets, and for the
 * same reason: a step transcribes a chunk, which takes longer than the
 * platform default. This route had no ceiling at all while the browser's
 * route had one — and this is the route that does the work when the tab is
 * closed, which is the case the scheduler exists for.
 */
export const maxDuration = 300

export async function POST(request: Request): Promise<Response> {
  if (!isTheScheduler(request.headers.get('authorization'), process.env['CRON_SECRET'])) {
    return Response.json({ error: 'NOT_SIGNED_IN' }, { status: 401 })
  }

  try {
    return Response.json(await advancePending())
  } catch (error) {
    console.error('could not advance a pending episode', error)
    return Response.json({ error: 'UNEXPECTED' }, { status: 500 })
  }
}
