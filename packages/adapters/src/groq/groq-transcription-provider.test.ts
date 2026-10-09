// US-003
import { describeTranscriptionProvider } from '@overtone/core/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GroqTranscriptionProvider } from './groq-transcription-provider.js'

const KNOWN = 'https://storage.example/episode-12.ogg'
const MISSING = 'https://storage.example/nope.ogg'

/** A recorded-shape `verbose_json` body, in Brazilian Portuguese. */
const RESPONSE = {
  task: 'transcribe',
  language: 'portuguese',
  duration: 2.4,
  text: 'E aí galera hoje falamos do pirão',
  words: [
    { word: 'E', start: 0, end: 0.2 },
    { word: 'aí', start: 0.2, end: 0.45 },
    { word: 'galera', start: 0.45, end: 0.9 },
    { word: 'hoje', start: 0.9, end: 1.2 },
    { word: 'falamos', start: 1.2, end: 1.7 },
    { word: 'do', start: 1.7, end: 1.85 },
    { word: 'pirão', start: 1.85, end: 2.4 },
  ],
}

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

const failed = (status: number, headers: Record<string, string> = {}) =>
  new Response('{"error":{"message":"nope"}}', { status, headers })

/** Routes on the `url` field so the contract's two cases both work. */
const routingFetch = vi.fn(async (_input: unknown, init?: RequestInit) => {
  const body = init?.body as FormData
  return body.get('url') === KNOWN ? ok(RESPONSE) : failed(404)
})

const provider = (fetchImpl: typeof globalThis.fetch) =>
  new GroqTranscriptionProvider({ apiKey: 'gsk-test', fetch: fetchImpl })

describeTranscriptionProvider('GroqTranscriptionProvider', () => ({
  provider: provider(routingFetch as unknown as typeof globalThis.fetch),
  knownAudioUrl: KNOWN,
  missingAudioUrl: MISSING,
}))

describe('GroqTranscriptionProvider', () => {
  let calls: Array<{ url: string; init: RequestInit }>
  let stub: typeof globalThis.fetch

  beforeEach(() => {
    calls = []
    stub = (async (input: unknown, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} })
      return ok(RESPONSE)
    }) as unknown as typeof globalThis.fetch
  })

  const fieldsOf = () => calls[0]?.init.body as FormData

  it('posts to the transcription endpoint', async () => {
    await provider(stub).transcribe({ audioUrl: KNOWN, language: 'pt' })
    expect(calls[0]?.url).toBe('https://api.groq.com/openai/v1/audio/transcriptions')
    expect(calls[0]?.init.method).toBe('POST')
  })

  it('authenticates with a bearer token and never puts the key in the body', async () => {
    await provider(stub).transcribe({ audioUrl: KNOWN, language: 'pt' })
    const headers = new Headers(calls[0]?.init.headers)
    expect(headers.get('authorization')).toBe('Bearer gsk-test')
    expect(fieldsOf().get('api_key')).toBeNull()
  })

  // Sending the audio by reference means a two-hour episode never passes
  // through our own server.
  it('sends the audio by url rather than uploading bytes', async () => {
    await provider(stub).transcribe({ audioUrl: KNOWN, language: 'pt' })
    expect(fieldsOf().get('url')).toBe(KNOWN)
    expect(fieldsOf().get('file')).toBeNull()
  })

  it('asks for word-level timings in Portuguese', async () => {
    await provider(stub).transcribe({ audioUrl: KNOWN, language: 'pt' })
    const fields = fieldsOf()
    expect(fields.get('model')).toBe('whisper-large-v3-turbo')
    expect(fields.get('language')).toBe('pt')
    expect(fields.get('response_format')).toBe('verbose_json')
    expect(fields.getAll('timestamp_granularities[]')).toContain('word')
  })

  it('converts seconds to milliseconds', async () => {
    const outcome = await provider(stub).transcribe({ audioUrl: KNOWN, language: 'pt' })
    if (!outcome.ok) throw new Error('expected a transcript')

    expect(outcome.transcript.words[0]).toEqual({ text: 'E', startMs: 0, endMs: 200 })
    expect(outcome.transcript.words[1]).toEqual({ text: 'aí', startMs: 200, endMs: 450 })
    expect(outcome.transcript.durationMs).toBe(2_400)
  })

  it('keeps the response verbatim so analysis can be re-run for free', async () => {
    const outcome = await provider(stub).transcribe({ audioUrl: KNOWN, language: 'pt' })
    if (!outcome.ok) throw new Error('expected a transcript')
    expect(outcome.transcript.raw).toEqual(RESPONSE)
  })

  it('falls back to the last word when no duration is reported', async () => {
    const noDuration = { ...RESPONSE, duration: undefined }
    const outcome = await provider(
      (async () => ok(noDuration)) as unknown as typeof globalThis.fetch,
    ).transcribe({ audioUrl: KNOWN, language: 'pt' })

    if (!outcome.ok) throw new Error('expected a transcript')
    expect(outcome.transcript.durationMs).toBe(2_400)
  })

  describe('failures', () => {
    const failWith = async (status: number, headers?: Record<string, string>) =>
      provider(
        (async () => failed(status, headers)) as unknown as typeof globalThis.fetch,
      ).transcribe({ audioUrl: KNOWN, language: 'pt' })

    it.each([
      [404, 'AUDIO_NOT_FOUND'],
      [400, 'AUDIO_NOT_FOUND'],
      [415, 'AUDIO_UNREADABLE'],
      [422, 'AUDIO_UNREADABLE'],
      [500, 'PROVIDER_UNAVAILABLE'],
      [503, 'PROVIDER_UNAVAILABLE'],
      [401, 'PROVIDER_UNAVAILABLE'],
    ])('maps %i to %s', async (status, code) => {
      const outcome = await failWith(status)
      if (outcome.ok) throw new Error('expected a failure')
      expect(outcome.failure.code).toBe(code)
    })

    it('reads the retry delay the service asks for', async () => {
      const outcome = await failWith(429, { 'retry-after': '30' })
      if (outcome.ok) throw new Error('expected a failure')
      expect(outcome.failure).toEqual({
        code: 'ALLOWANCE_EXHAUSTED',
        retryAfterMs: 30_000,
      })
    })

    it('guesses a delay when the service does not say', async () => {
      const outcome = await failWith(429)
      if (outcome.ok) throw new Error('expected a failure')
      if (outcome.failure.code !== 'ALLOWANCE_EXHAUSTED') throw new Error('wrong code')
      expect(outcome.failure.retryAfterMs).toBeGreaterThan(0)
    })

    it('treats a network error as the service being unavailable', async () => {
      const outcome = await provider(
        (async () => {
          throw new TypeError('fetch failed')
        }) as unknown as typeof globalThis.fetch,
      ).transcribe({ audioUrl: KNOWN, language: 'pt' })

      if (outcome.ok) throw new Error('expected a failure')
      expect(outcome.failure.code).toBe('PROVIDER_UNAVAILABLE')
    })

    // A transcript with no words counts to zero, and zero looks like an
    // answer. Better to fail loudly than to publish a confident nothing.
    it('refuses a response with no word timings', async () => {
      const outcome = await provider(
        (async () => ok({ text: 'olá', words: [] })) as unknown as typeof globalThis.fetch,
      ).transcribe({ audioUrl: KNOWN, language: 'pt' })

      if (outcome.ok) throw new Error('expected a failure')
      expect(outcome.failure.code).toBe('PROVIDER_RESPONSE_INVALID')
    })

    it('refuses a body that is not json', async () => {
      const outcome = await provider(
        (async () => new Response('<html>502</html>', { status: 200 })) as unknown as typeof globalThis.fetch,
      ).transcribe({ audioUrl: KNOWN, language: 'pt' })

      if (outcome.ok) throw new Error('expected a failure')
      expect(outcome.failure.code).toBe('PROVIDER_RESPONSE_INVALID')
    })
  })
})

// ADR 0021
describe('the allowance it reports', () => {
  const LIMIT_HEADERS = {
    'content-type': 'application/json',
    'x-ratelimit-limit-audio-seconds': '7200',
    'x-ratelimit-remaining-audio-seconds': '6300',
    'x-ratelimit-reset-audio-seconds': '7m30s',
  }

  const respond = (response: Response) =>
    provider((async () => response) as unknown as typeof globalThis.fetch)

  it('passes on what the provider said', async () => {
    const outcome = await respond(
      new Response(JSON.stringify(RESPONSE), { status: 200, headers: LIMIT_HEADERS }),
    ).transcribe({ audioUrl: KNOWN, language: 'pt' })

    expect(outcome.observedAllowance).toEqual({
      limitAudioMs: 7_200_000,
      remainingAudioMs: 6_300_000,
      refillsFullyInMs: 450_000,
    })
  })

  // The refusal that matters most is the one for being over the limit, and it
  // carries the headers too. Dropping them there would throw away the only
  // reading taken at the exact moment it became relevant.
  it('passes it on when the provider refuses the audio', async () => {
    const outcome = await respond(
      new Response('{"error":{"message":"ASPH"}}', { status: 413, headers: LIMIT_HEADERS }),
    ).transcribe({ audioUrl: KNOWN, language: 'pt' })

    expect(outcome.ok).toBe(false)
    expect(outcome.observedAllowance?.remainingAudioMs).toBe(6_300_000)
  })

  it('reports nothing when the provider sends no headers', async () => {
    const outcome = await respond(ok(RESPONSE)).transcribe({ audioUrl: KNOWN, language: 'pt' })
    expect(outcome.observedAllowance).toBeUndefined()
  })

  // Nothing to read when the request never arrived, and inventing a balance
  // would be worse than admitting we do not know.
  it('reports nothing when the request never got there', async () => {
    const outcome = await provider(
      (() => Promise.reject(new Error('offline'))) as unknown as typeof globalThis.fetch,
    ).transcribe({ audioUrl: KNOWN, language: 'pt' })

    expect(outcome.ok).toBe(false)
    expect(outcome.observedAllowance).toBeUndefined()
  })
})
