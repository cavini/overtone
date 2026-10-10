import { mustOwnEpisode } from '../../../../server/analyse-upload.js'
import { refusal, requireUser } from '../../../../server/session.js'
import { transcriptSoFar } from '../../../../server/transcript-so-far.js'

export const runtime = 'nodejs'

/**
 * The words an episode has so far.
 *
 * Costs nothing to run — the chunks are already stored and already paid for,
 * so reading them back spends no allowance and no provider call. That is why
 * it can be asked repeatedly while the rest of the episode is still going.
 *
 * `from` is the chunk the reader already has up to. Everything before it is
 * on their screen, so sending it again would move an episode's worth of
 * words every few seconds to report that nothing had happened.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  const episodeId = params.get('episodeId') ?? ''
  const from = Number.parseInt(params.get('from') ?? '0', 10)

  if (episodeId.length === 0) {
    return Response.json({ error: 'UNEXPECTED' }, { status: 400 })
  }

  try {
    // An episode id in a query string is not a permission.
    await mustOwnEpisode((await requireUser()).userId, episodeId)

    return Response.json(await transcriptSoFar(episodeId, Number.isNaN(from) ? 0 : from))
  } catch (error) {
    const denied = refusal(error)
    if (denied !== undefined) return denied

    console.error('could not read the transcript so far', error)
    return Response.json({ error: 'UNEXPECTED' }, { status: 500 })
  }
}
