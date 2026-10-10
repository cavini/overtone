import { refusal, requireUser } from '../../../server/session.js'
import { shareEpisode, stopSharing } from '../../../server/sharing.js'

const episodeFrom = async (request: Request): Promise<string> => {
  const body = (await request.json().catch(() => ({}))) as { episodeId?: unknown }

  return typeof body.episodeId === 'string' ? body.episodeId : ''
}

/** Starts sharing one episode, and hands back the link. */
export async function POST(request: Request): Promise<Response> {
  const episodeId = await episodeFrom(request)
  if (episodeId.length === 0) return Response.json({ error: 'UNEXPECTED' }, { status: 400 })

  try {
    const token = await shareEpisode((await requireUser()).userId, episodeId)

    // An absolute link, because the point of it is to be pasted elsewhere.
    return Response.json({ url: new URL(`/s/${token}`, request.url).toString() })
  } catch (error) {
    const denied = refusal(error)
    if (denied !== undefined) return denied

    console.error('could not share the episode', error)
    return Response.json({ error: 'UNEXPECTED' }, { status: 500 })
  }
}

/** Stops sharing. The link 404s from the next request. */
export async function DELETE(request: Request): Promise<Response> {
  const episodeId = new URL(request.url).searchParams.get('episodeId') ?? ''
  if (episodeId.length === 0) return Response.json({ error: 'UNEXPECTED' }, { status: 400 })

  try {
    await stopSharing((await requireUser()).userId, episodeId)
    return Response.json({ ok: true })
  } catch (error) {
    const denied = refusal(error)
    if (denied !== undefined) return denied

    console.error('could not stop sharing the episode', error)
    return Response.json({ error: 'UNEXPECTED' }, { status: 500 })
  }
}
