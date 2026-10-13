import { recordBoundaries } from '../../../../server/boundaries.js'
import { refusal, requireUser } from '../../../../server/session.js'

export const runtime = 'nodejs'

/** Where the browser says it actually cut the audio (US-040). */
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser()

    const body: unknown = await request.json().catch(() => undefined)
    if (typeof body !== 'object' || body === null) {
      return Response.json({ error: 'WRONG_SHAPE' }, { status: 400 })
    }

    const { episodeId, startsMs } = body as { episodeId?: unknown; startsMs?: unknown }
    if (typeof episodeId !== 'string' || !Array.isArray(startsMs)) {
      return Response.json({ error: 'WRONG_SHAPE' }, { status: 400 })
    }

    const recorded = await recordBoundaries(user.userId, episodeId, startsMs as number[])

    return recorded.ok
      ? Response.json({ ok: true })
      : Response.json({ error: recorded.refusal }, { status: 409 })
  } catch (caught) {
    const refused = refusal(caught)
    if (refused !== undefined) return refused
    throw caught
  }
}
