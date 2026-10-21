import { retryEpisode } from '../../../../server/analyse-upload.js'
import { refusal, requireUser } from '../../../../server/session.js'

export const runtime = 'nodejs'

/**
 * Puts a failed episode back in the queue.
 *
 * A POST rather than something on the advance route, because it changes
 * which episodes the scheduler is willing to look at and does no work
 * itself: the next scheduled run does that, pacing the remaining chunks
 * against the allowance exactly as it would for a new upload.
 *
 * `retried: false` is a true answer, not an error — the episode had not
 * failed, so there was nothing to put back.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { episodeId?: string }
  const episodeId = String(body.episodeId ?? '')

  if (episodeId.length === 0) return Response.json({ error: 'UNEXPECTED' }, { status: 400 })

  try {
    const retried = await retryEpisode((await requireUser()).userId, episodeId)
    return Response.json({ retried })
  } catch (error) {
    const denied = refusal(error)
    if (denied !== undefined) return denied

    console.error('could not retry the episode', error)
    return Response.json({ error: 'UNEXPECTED' }, { status: 500 })
  }
}
