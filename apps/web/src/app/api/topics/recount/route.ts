import { refusal, requireUser } from '../../../../server/session.js'
import { recountFinished } from '../../../../server/analyse-upload.js'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Counts the running jokes again across every finished episode.
 *
 * Costs nothing: the transcripts are already stored, so this re-reads them
 * rather than re-transcribing. Defining a joke today can therefore count it
 * in an episode from last month, which is the whole reason the provider's
 * payload is never discarded (ADR 0005).
 */
export async function POST(): Promise<Response> {
  try {
    return Response.json({ episodes: await recountFinished((await requireUser()).userId) })
  } catch (error) {
    const denied = refusal(error)
    if (denied !== undefined) return denied

    console.error('could not recount', error)
    return Response.json({ error: 'UNEXPECTED' }, { status: 500 })
  }
}
