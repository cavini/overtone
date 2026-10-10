import { DEFAULT_LOCALE, LOCALES, type Locale } from '@overtone/messages'
import { withAdvanceLease } from '../../../../server/advance-pending.js'
import { advanceOnce } from '../../../../server/analyse-upload.js'
import { presentAnalysis, presentOutcome } from '../../../../presenter/episode-view.js'

export const runtime = 'nodejs'

/** Hobby's ceiling. One chunk takes a fraction of it. */
export const maxDuration = 300

/**
 * How soon to come back when the schedule is mid-step.
 *
 * Short, because a step is seconds and the tab is watching: this is not the
 * allowance saying wait, it is two drivers of the same loop taking turns.
 */
const BUSY_RETRY_MS = 3_000

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
    /*
     * Under the same lease the schedule takes.
     *
     * An episode is advanced by two drivers now — this, when a tab is open,
     * and `pg_cron` when one is not (ADR 0027). They share one global
     * allowance, so two advances at once would transcribe the same chunk
     * twice and pay for it twice.
     */
    const result = await withAdvanceLease(() => advanceOnce(episodeId))

    // The schedule has it. It is doing the same work this call would have
    // done, so there is nothing to report but "ask again shortly".
    if (result === undefined) {
      return Response.json({ busy: true, retryAfterMs: BUSY_RETRY_MS })
    }

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
