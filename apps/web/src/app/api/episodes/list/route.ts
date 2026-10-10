import { deleteEpisode, listEpisodes } from '../../../../server/analyse-upload.js'

export const runtime = 'nodejs'

/** Every episode, so one can be chosen and read. */
export async function GET(): Promise<Response> {
  try {
    return Response.json({ episodes: await listEpisodes() })
  } catch (error) {
    console.error('could not list episodes', error)
    return Response.json({ episodes: [] }, { status: 200 })
  }
}

/**
 * Removes one episode for good.
 *
 * Its transcript, counts and mentions go with it — they describe an episode
 * that no longer exists, and keeping them would leave search returning
 * moments from nothing.
 */
export async function DELETE(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (id.length === 0) return Response.json({ error: 'UNEXPECTED' }, { status: 400 })

  try {
    await deleteEpisode(id)
    return Response.json({ ok: true })
  } catch (error) {
    console.error('could not delete the episode', error)
    return Response.json({ error: 'UNEXPECTED' }, { status: 500 })
  }
}
