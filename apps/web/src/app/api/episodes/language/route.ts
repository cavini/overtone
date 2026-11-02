import {
  DEFAULT_LOCALE,
  LOCALES,
  renderMessage,
  type Locale,
} from '@overtone/messages'
import { detectLanguageOf, mustOwnEpisode } from '../../../../server/analyse-upload.js'
import { refusal, requireUser } from '../../../../server/session.js'

export const runtime = 'nodejs'

const localeOf = (value: unknown): Locale =>
  LOCALES.includes(value as Locale) ? (value as Locale) : DEFAULT_LOCALE

/**
 * Settles what the episode is spoken in, from the episode's own audio.
 *
 * Called after the probe windows are uploaded and before any chunk is cut,
 * because a chunk states the episode's language when it is sent. Refusing
 * here costs three thirty-second probes and leaves nothing stored; letting
 * it through on a guess costs a full set of counts that look right.
 *
 * The interface language is read only to choose which language to refuse in.
 * It has no say in what the audio is taken to be — that is the whole point
 * of this endpoint existing.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser()

    const body: unknown = await request.json().catch(() => undefined)
    if (typeof body !== 'object' || body === null) {
      return Response.json({ error: 'WRONG_SHAPE' }, { status: 400 })
    }

    const { episodeId, locale: asked } = body as { episodeId?: unknown; locale?: unknown }
    if (typeof episodeId !== 'string') {
      return Response.json({ error: 'WRONG_SHAPE' }, { status: 400 })
    }

    const locale = localeOf(asked)
    await mustOwnEpisode(user.userId, episodeId)

    const detected = await detectLanguageOf(episodeId)

    if (detected.ok) return Response.json({ language: detected.language })

    return Response.json(
      {
        error:
          detected.reason === 'unsupported'
            ? renderMessage(locale, 'AUDIO_LANGUAGE_UNSUPPORTED', { heard: detected.heard })
            : renderMessage(locale, 'AUDIO_LANGUAGE_UNDECIDED', {}),
      },
      { status: 409 },
    )
  } catch (caught) {
    const refused = refusal(caught)
    if (refused !== undefined) return refused
    throw caught
  }
}
