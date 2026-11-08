import { AUDIO_LANGUAGES, type AudioLanguage } from '@overtone/core'
import type {
  TimedWord,
  TranscriptionFailure,
  TranscriptionOutcome,
  TranscriptionProvider,
  TranscriptionRequest,
} from '@overtone/core'
import { readAllowance } from './rate-limit-headers.js'
import { groqTranscriptionResponse } from './transcription-response.js'

const ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions'
/**
 * The full model, not the distilled `-turbo`.
 *
 * Both carry the same free allowance — measured, 7,200 audio-seconds an hour
 * each, and in separate buckets — so the faster one buys nothing here. What
 * pacing costs is governed by the allowance refilling at two audio-seconds
 * per wall-second, never by how long the provider takes to answer: ninety
 * seconds of audio came back in two seconds against the turbo model's one
 * and a half.
 *
 * And turbo is measurably worse on this show. On a real ninety-second slice
 * it rendered a plain, very common sentence as `Mas tem marucu!`, where the
 * full model heard it correctly. A wrong word is not a small cost in a
 * product whose entire output is counts of words.
 */
const MODEL = 'whisper-large-v3'

/** Used when a rate-limited response does not say when to come back. */
const FALLBACK_RETRY_MS = 60_000

export interface GroqTranscriptionOptions {
  readonly apiKey: string
  /**
   * Injected rather than taken from the global so the adapter can be driven
   * in tests without patching anything process-wide.
   */
  readonly fetch?: typeof globalThis.fetch
  readonly endpoint?: string
  readonly model?: string
}

const secondsToMs = (seconds: number): number => Math.round(seconds * 1000)

/**
 * What the provider calls each language we can analyse.
 *
 * It answers in full English names rather than codes — the recorded
 * response body says `"portuguese"` — so this is a translation, not a
 * validation. Both spellings are accepted because the name is the one we
 * have actually observed and the code is what the parameter we send uses,
 * and an endpoint that started answering in its own input vocabulary should
 * not read as an unsupported language.
 *
 * Anything absent from here is refused rather than defaulted. Mapping an
 * unknown language onto Portuguese is how Spanish audio gets counted
 * against Portuguese stop words and reported as if it were right.
 */
const PROVIDER_LANGUAGE_NAMES: Readonly<Record<string, AudioLanguage>> = {
  portuguese: 'pt',
  english: 'en',
}

function asOurLanguage(heard: string | undefined): AudioLanguage | undefined {
  if (heard === undefined) return undefined

  const named = heard.trim().toLowerCase()

  return (
    PROVIDER_LANGUAGE_NAMES[named] ??
    AUDIO_LANGUAGES.find((language): boolean => language === named)
  )
}

/**
 * HTTP status to a reason the caller can act on.
 *
 * The distinction that matters is retryable versus not: an exhausted
 * allowance comes back later, a file the service cannot fetch never will.
 * Anything unrecognised is treated as transient, which is the safer default —
 * a needless retry costs a request, while giving up on a blip costs the
 * episode.
 */
function failureFor(response: Response): TranscriptionFailure {
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after'))
    return {
      code: 'ALLOWANCE_EXHAUSTED',
      retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0
        ? secondsToMs(retryAfter)
        : FALLBACK_RETRY_MS,
    }
  }

  if (response.status === 404 || response.status === 400) {
    return { code: 'AUDIO_NOT_FOUND' }
  }

  if (response.status === 415 || response.status === 422) {
    return { code: 'AUDIO_UNREADABLE' }
  }

  return { code: 'PROVIDER_UNAVAILABLE' }
}

/**
 * Transcribes through Groq's Whisper endpoint.
 *
 * Audio is sent **by reference**, as a signed storage URL, so a two-hour
 * episode never passes through our own server — the service fetches it
 * directly.
 *
 * The language is stated for every chunk of a real episode, and omitted only
 * by a probe whose purpose is to be told what the audio is. Detection still
 * carries the risk it always did — Spanish heard as Portuguese produces
 * fluent nonsense that still counts — which is why nothing here defaults:
 * a language this codebase has no pack for is refused by name.
 *
 * Held to the same contract suite as the fake, so neither can quietly promise
 * something the other does not.
 */
export class GroqTranscriptionProvider implements TranscriptionProvider {
  private readonly apiKey: string
  private readonly fetch: typeof globalThis.fetch
  private readonly endpoint: string
  private readonly model: string

  constructor(options: GroqTranscriptionOptions) {
    this.apiKey = options.apiKey
    this.fetch = options.fetch ?? globalThis.fetch
    this.endpoint = options.endpoint ?? ENDPOINT
    this.model = options.model ?? MODEL
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionOutcome> {
    const fields = new FormData()
    fields.set('url', request.audioUrl)
    fields.set('model', this.model)
    /*
     * Omitted rather than empty when there is nothing to state. The endpoint
     * detects when the field is absent; an empty string is a value, and a
     * value it cannot parse is a 400 rather than a detection.
     */
    if (request.language !== undefined) {
      fields.set('language', request.language)
    }
    fields.set('response_format', 'verbose_json')
    // Greedy decoding. Sampling is a way of guessing, and a count built on a
    // guess is worse than a gap in one.
    fields.set('temperature', '0')
    /*
     * What the chunk before this one said, when there was one.
     *
     * Only ever the preceding transcript. A glossary of the show's names was
     * measured here too and made things worse: the model copies the shape of
     * whatever it is handed, so a list came back as a list, with labels
     * stamped through the speech.
     */
    if (request.precedingText !== undefined && request.precedingText.length > 0) {
      fields.set('prompt', request.precedingText)
    }
    fields.append('timestamp_granularities[]', 'word')
    fields.append('timestamp_granularities[]', 'segment')

    let response: Response
    try {
      response = await this.fetch(this.endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}` },
        body: fields,
      })
    } catch {
      return { ok: false, failure: { code: 'PROVIDER_UNAVAILABLE' } }
    }

    // Read before anything can go wrong with the body. This is the balance
    // at the moment of the request, and it is reported on refusals too —
    // including the one for being over the limit, where it matters most
    // (ADR 0021).
    const observedAllowance = readAllowance(response.headers)

    if (!response.ok) {
      return { ok: false, failure: failureFor(response), observedAllowance }
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return { ok: false, failure: { code: 'PROVIDER_RESPONSE_INVALID' }, observedAllowance }
    }

    const parsed = groqTranscriptionResponse.safeParse(payload)
    if (!parsed.success) {
      return { ok: false, failure: { code: 'PROVIDER_RESPONSE_INVALID' }, observedAllowance }
    }

    const words: TimedWord[] = parsed.data.words.map((word) => ({
      text: word.word,
      startMs: secondsToMs(word.start),
      endMs: secondsToMs(word.end),
    }))

    const segmentStartsMs = (parsed.data.segments ?? []).map((segment) =>
      secondsToMs(segment.start),
    )

    const lastWord = words.at(-1)

    /*
     * Told, we echo. Told nothing, we take the answer — and narrow it here,
     * because this is the only layer that knows the provider's vocabulary.
     *
     * It answers in full English names: the recorded response says
     * `"portuguese"`. That string handed onward would miss both stop-word
     * lists and both halves of the lemma dictionary, and `languagePack`
     * would quietly serve Portuguese for it, so an unrecognised language is
     * a refusal rather than a value.
     */
    const heard = request.language ?? asOurLanguage(parsed.data.language)

    if (heard === undefined) {
      return parsed.data.language === undefined
        ? // Asked to detect, and it did not say. The field is optional in
          // the schema because a stated request does not need it; a probe
          // without it got no answer to the only question it asked.
          { ok: false, failure: { code: 'PROVIDER_RESPONSE_INVALID' }, observedAllowance }
        : {
            ok: false,
            failure: { code: 'LANGUAGE_NOT_SUPPORTED', heard: parsed.data.language },
            observedAllowance,
          }
    }

    return {
      ok: true,
      observedAllowance,
      transcript: {
        provider: 'groq',
        providerModel: this.model,
        text: parsed.data.text,
        words,
        segmentStartsMs,
        language: heard,
        durationMs:
          parsed.data.duration !== undefined
            ? secondsToMs(parsed.data.duration)
            : (lastWord?.endMs ?? 0),
        // Kept untouched. It is what lets every derived number be recomputed
        // when the analysis improves, without paying to transcribe again.
        raw: payload,
      },
    }
  }
}
