import { listEpisodes } from '../../../../server/analyse-upload.js'

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
