import { asAudioLanguage, DAILY_ALLOWANCE_MS, planChunks } from '@overtone/core'
import {
  DEFAULT_LOCALE,
  LOCALES,
  renderMessage,
  type Locale,
  type MessageCode,
  type MessageParams,
} from '@overtone/messages'
import { remainingDailyHours, startEpisode } from '../../../../server/analyse-upload.js'

export const runtime = 'nodejs'

/**
 * Nothing but JSON crosses this boundary.
 *
 * The audio goes from the browser straight to storage using the URLs this
 * hands back. That is not an optimisation: a serverless function accepts
 * about 4.5 MB of request body, and an episode of this show is a hundred
 * times that, so uploading through here is not slow — it is impossible.
 */

const localeOf = (value: unknown): Locale =>
  LOCALES.includes(value as Locale) ? (value as Locale) : DEFAULT_LOCALE

const bad = <Code extends MessageCode>(
  locale: Locale,
  code: Code,
  params: MessageParams[Code],
  status = 400,
): Response => Response.json({ error: renderMessage(locale, code, params) }, { status })

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    durationMs?: number
    title?: string
    audioDigest?: string
    locale?: string
  }

  const locale = localeOf(body.locale)
  const durationMs = Number(body.durationMs)
  const title = (body.title ?? '').trim()

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return bad(locale, 'UNREADABLE_AUDIO', { filename: title })
  }

  if (title.length === 0) {
    return bad(locale, 'EPISODE_TITLE_REQUIRED', {})
  }

  // The one length that still cannot work: an episode longer than a whole
  // day's allowance would never finish, however patiently it is paced.
  if (durationMs > DAILY_ALLOWANCE_MS) {
    return bad(
      locale,
      'EPISODE_TOO_LONG',
      {
        duration_minutes: Math.round(durationMs / 60_000),
        max_minutes: Math.floor(DAILY_ALLOWANCE_MS / 60_000),
        allowance_hours_today: await remainingDailyHours(),
      },
      413,
    )
  }

  try {
    /*
     * The interface language chooses what the audio is transcribed as.
     *
     * It used to be fixed at Portuguese and the interface was explicitly
     * forbidden from influencing it (ADR 0014), on the grounds that a count
     * must not change because someone switched languages. That still holds
     * for an episode already transcribed — this is recorded on the episode
     * at upload and never revisited (ADR 0022).
     */
    /*
     * The filename goes in, not a title.
     *
     * `startEpisode` reads a presentable name out of it — and the episode
     * number, when the filename carries one. Storing the filename verbatim
     * gave a library that read like a directory listing.
     */
    const started = await startEpisode(
      durationMs,
      title,
      asAudioLanguage(locale),
      typeof body.audioDigest === 'string' ? body.audioDigest : undefined,
    )

    return Response.json({
      ...started,
      // So the page can show progress against something real.
      chunkCount: planChunks(durationMs).length,
    })
  } catch (error) {
    console.error('could not start episode', error)
    return Response.json({ error: 'UNEXPECTED' }, { status: 500 })
  }
}
