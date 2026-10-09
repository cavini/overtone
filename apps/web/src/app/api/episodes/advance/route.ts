import { DEFAULT_LOCALE, LOCALES, type Locale } from '@overtone/messages'
import { advanceOnce } from '../../../../server/analyse-upload.js'
import { presentAnalysis, presentOutcome } from '../../../../presenter/episode-view.js'

export const runtime = 'nodejs'

/** Hobby's ceiling. One chunk takes a fraction of it. */
export const maxDuration = 300

const localeOf = (value: unknown): Locale =>
  LOCALES.includes(value as Locale) ? (value as Locale) : DEFAULT_LOCALE

/**
 * Carries one episode forward by one chunk.
 *
 * Returns rather than sleeps when the allowance is spent. An episode is
 * longer than a full hourly balance, so part of it always waits for refill
 * (ADR 0020) — and a function that waited would be killed long before the
 * episode finished.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    episodeId?: string
    locale?: string
  }

  const locale = localeOf(body.locale)
  const episodeId = String(body.episodeId ?? '')

  if (episodeId.length === 0) {
    return Response.json({ error: 'UNEXPECTED' }, { status: 400 })
  }

  try {
    const result = await advanceOnce(episodeId)

    return Response.json({
      status: presentOutcome(result.outcome, locale, { chunkCount: result.chunkCount }),
      analysis: result.analysis ? presentAnalysis(result.analysis, locale) : undefined,
      // How long to wait before coming back, when it said to wait.
      retryAfterMs: result.outcome.state === 'waiting' ? result.outcome.retryAfterMs : 0,
      chunksDone: result.chunksDone,
      chunkCount: result.chunkCount,
    })
  } catch (error) {
    console.error('could not advance episode', error)
    return Response.json({ error: 'UNEXPECTED' }, { status: 500 })
  }
}
