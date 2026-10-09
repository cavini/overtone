import { planChunks, SINGLE_CHUNK_LIMIT_MS } from '@overtone/core'
import {
  DEFAULT_LOCALE,
  LOCALES,
  renderMessage,
  type Locale,
  type MessageCode,
  type MessageParams,
} from '@overtone/messages'
import { ACCEPTED_EXTENSIONS, audioTypeOf } from '../../../audio/audio-type.js'
import { analyseUpload, remainingDailyHours } from '../../../server/analyse-upload.js'
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

const MAX_BYTES = 25 * 1024 * 1024

const localeOf = (value: FormDataEntryValue | null): Locale =>
  LOCALES.includes(value as Locale) ? (value as Locale) : DEFAULT_LOCALE

/**
 * A refusal, in the reader's language.
 *
 * Generic over the code so the compiler checks the parameters against the
 * catalogue. It used to take `Record<string, unknown>` and cast — which
 * compiled fine and then failed at runtime with a 500, because a message
 * wanted a third parameter nobody had passed.
 */
const bad = <Code extends MessageCode>(
  locale: Locale,
  code: Code,
  params: MessageParams[Code],
  status = 400,
): Response => Response.json({ error: renderMessage(locale, code, params) }, { status })

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData()
  const locale = localeOf(form.get('locale'))
  const file = form.get('audio')
  const durationMs = Number(form.get('durationMs'))

  if (!(file instanceof File)) {
    return bad(locale, 'UNREADABLE_AUDIO', { filename: '' })
  }

  // Decided from the extension, never from what the browser claims. Chrome
  // reports `application/octet-stream` for an .m4a picked from disk, and
  // trusting it rejected real episodes as unsupported.
  const contentType = audioTypeOf(file.name, String(form.get('contentType') ?? file.type))
  if (contentType === undefined) {
    return bad(locale, 'UNSUPPORTED_FORMAT', {
      extension: file.name.split('.').pop() ?? '',
      // Straight from the table the server actually checks against, so the
      // list it offers cannot drift from the list it accepts.
      accepted: Object.keys(ACCEPTED_EXTENSIONS),
    })
  }

  // The browser measures the duration, because the chunk plan needs it before
  // anything is sent and the server would have to decode the audio to learn
  // it. A file whose duration we do not know cannot be paced.
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return bad(locale, 'UNREADABLE_AUDIO', { filename: file.name })
  }

  if (file.size > MAX_BYTES || planChunks(durationMs).length > 1) {
    /*
     * Refused rather than mishandled.
     *
     * An episode longer than one chunk has to be cut before it is sent, and
     * the browser cannot cut audio yet — that is M1's work. Accepting it
     * would send the *whole file* as every chunk: a two-hour episode
     * transcribed seven times over, several days of allowance spent at
     * once, and a transcript that repeats itself. Better to say no, and say
     * how much room is left today so the answer is actionable.
     */
    return bad(
      locale,
      'EPISODE_TOO_LONG',
      {
        duration_minutes: Math.round(durationMs / 60_000),
        max_minutes: Math.floor(SINGLE_CHUNK_LIMIT_MS / 60_000),
        allowance_hours_today: await remainingDailyHours(),
      },
      413,
    )
  }


  const audio = new Uint8Array(await file.arrayBuffer())
  const title = file.name.replace(/\.[^.]+$/u, '')

  try {
    const result = await analyseUpload(audio, contentType, durationMs, title)

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
