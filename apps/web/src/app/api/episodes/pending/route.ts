import { pendingEpisode } from '../../../../server/analyse-upload.js'

export const runtime = 'nodejs'

/**
 * The episode still being transcribed, if there is one.
 *
 * Exists because the browser is what drives transcription forward, and a
 * browser gets closed. An episode of this show takes longer than a sitting:
 * the audio is already uploaded and partly transcribed, paid for out of a
 * budget of three episodes a day, and without this the only way back to it
 * was to upload the whole thing again — which is exactly what happened.
 */
export async function GET(): Promise<Response> {
  try {
    return Response.json({ episode: await pendingEpisode() })
  } catch (error) {
    console.error('could not look for a pending episode', error)
    return Response.json({ episode: null }, { status: 200 })
  }
}
