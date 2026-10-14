import { correctLine, isSensible } from '../../../../server/corrections.js'
import { refusal, requireUser } from '../../../../server/session.js'

export const runtime = 'nodejs'

/** Re-analysing an episode is the slow part, not the typing. */
export const maxDuration = 300

/** What was actually said, in place of what the transcriber heard (US-049). */
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser()

    const body: unknown = await request.json().catch(() => undefined)
    if (typeof body !== 'object' || body === null) {
      return Response.json({ error: 'WRONG_SHAPE' }, { status: 400 })
    }

    const { episodeId, fromMs, toMs, text } = body as Record<string, unknown>
    if (
      typeof episodeId !== 'string' ||
      typeof fromMs !== 'number' ||
      typeof toMs !== 'number' ||
      typeof text !== 'string'
    ) {
      return Response.json({ error: 'WRONG_SHAPE' }, { status: 400 })
    }

    if (!isSensible(fromMs, toMs, text)) {
      return Response.json({ error: 'WRONG_SHAPE' }, { status: 400 })
    }

    await correctLine(user.userId, episodeId, fromMs, toMs, text)

    return Response.json({ ok: true })
  } catch (caught) {
    const refused = refusal(caught)
    if (refused !== undefined) return refused
    throw caught
  }
}
