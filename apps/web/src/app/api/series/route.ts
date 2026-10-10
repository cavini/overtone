import { refusal, requireUser } from '../../../server/session.js'
import { seriesOverview } from '../../../server/series.js'

/**
 * Everything the group has recorded, counted together.
 *
 * Costs nothing to run: it reads aggregates already stored when each episode
 * was analysed, so it spends no transcription allowance and no provider call.
 */
export async function GET(): Promise<Response> {
  try {
    return Response.json(await seriesOverview((await requireUser()).userId))
  } catch (error) {
    const denied = refusal(error)
    if (denied !== undefined) return denied

    console.error('could not read the series overview', error)
    return Response.json({ error: 'UNEXPECTED' }, { status: 500 })
  }
}
