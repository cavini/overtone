import { DEFAULT_LOCALE, LOCALES, renderMessage, type Locale } from '@overtone/messages'
import { analyseUpload } from '../../../server/analyse-upload.js'
import { presentAnalysis, presentOutcome } from '../../../presenter/episode-view.js'

/** Node, not edge: the pipeline talks to Postgres over a socket. */
export const runtime = 'nodejs'

/**
 * Hobby plan's ceiling.
 *
 * Generous for a clip and nowhere near enough for a full episode, which is
 * exactly why waiting returns to the caller instead of sleeping (ADR 0020).
 */
export const maxDuration = 300

/** What Whisper will take, and what the bucket is configured to accept. */
const ACCEPTED = new Set([
  'audio/mpeg', 'audio/mp4', 'audio/m4a', 'audio/x-m4a',
  'audio/ogg', 'audio/opus', 'audio/webm', 'audio/wav', 'audio/x-wav',
])

const MAX_BYTES = 25 * 1024 * 1024

const localeOf = (value: FormDataEntryValue | null): Locale =>
  LOCALES.includes(value as Locale) ? (value as Locale) : DEFAULT_LOCALE

const bad = (locale: Locale, code: 'UNSUPPORTED_FORMAT' | 'UNREADABLE_AUDIO' | 'EPISODE_TOO_LONG', params: Record<string, unknown>, status = 400) =>
  Response.json(
    { error: renderMessage(locale, code, params as never) },
    { status },
  )

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData()
  const locale = localeOf(form.get('locale'))
  const file = form.get('audio')
  const durationMs = Number(form.get('durationMs'))

  if (!(file instanceof File)) {
    return bad(locale, 'UNREADABLE_AUDIO', { filename: '' })
  }

  const extension = file.name.split('.').pop() ?? ''
  if (!ACCEPTED.has(file.type)) {
    return bad(locale, 'UNSUPPORTED_FORMAT', {
      extension,
      accepted_formats: ['mp3', 'm4a', 'ogg', 'opus', 'wav'],
    })
  }

  // The browser measures the duration, because the chunk plan needs it before
  // anything is sent and the server would have to decode the audio to learn
  // it. A file whose duration we do not know cannot be paced.
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return bad(locale, 'UNREADABLE_AUDIO', { filename: file.name })
  }

  if (file.size > MAX_BYTES) {
    return bad(locale, 'EPISODE_TOO_LONG', {
      duration_minutes: Math.round(durationMs / 60_000),
      max_minutes: 120,
    }, 413)
  }

  const audio = new Uint8Array(await file.arrayBuffer())
  const title = file.name.replace(/\.[^.]+$/u, '')

  try {
    const result = await analyseUpload(audio, file.type, durationMs, title)

    // Presented here rather than in the browser, so the one place that turns
    // codes into sentences stays on the server (ADR 0017).
    return Response.json({
      episodeId: result.episodeId,
      status: presentOutcome(result.outcome, locale, {
        chunkCount: result.chunkCount,
        filename: file.name,
      }),
      analysis: result.analysis ? presentAnalysis(result.analysis, locale) : undefined,
    })
  } catch (error) {
    // Not a message code: an unexpected fault is not a product condition, and
    // dressing it up as one would hide it.
    console.error('upload failed', error)
    return Response.json({ error: 'UNEXPECTED' }, { status: 500 })
  }
}
