import { requireUser, refusal } from '../../../../server/session.js'
import { seriesWords } from '../../../../server/series.js'

export const runtime = 'nodejs'

/**
 * The words the series says most.
 *
 * Its own route, away from `/api/series`, because that one is asked for on
 * every page load and again after every upload — anything in it is paid for
 * whether or not somebody looks at it. This table arrives folded shut, so it
 * is asked for the first time it is opened and never otherwise.
 *
 * Not because it is expensive: it costs about what one search does. Because
 * a thing nobody has looked at should not be computed on their behalf.
 */
export async function GET(): Promise<Response> {
  try {
    return Response.json({ terms: await seriesWords((await requireUser()).userId) })
  } catch (error) {
    const denied = refusal(error)
    if (denied !== undefined) return denied

    console.error('could not total the series words', error)
    return Response.json({ terms: [] }, { status: 200 })
  }
}
