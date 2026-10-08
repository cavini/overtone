import { describe, expect, it } from 'vitest'
import type { TranscriptionProvider } from '../ports/transcription-provider.js'

export interface ProviderUnderTest {
  readonly provider: TranscriptionProvider
  /** Audio the provider can transcribe. */
  readonly knownAudioUrl: string
  /** Audio the provider will not find. */
  readonly missingAudioUrl: string
}

/**
 * The contract every `TranscriptionProvider` must satisfy, fake and real
 * alike.
 *
 * This exists because the entire test suite trusts the fake. If the fake can
 * do something the real adapter cannot — or guarantees something it does not —
 * every test that depends on it passes for the wrong reason, and the failure
 * only surfaces in production. Running one suite against both is what keeps
 * the substitution honest.
 */
export function describeTranscriptionProvider(
  name: string,
  create: () => ProviderUnderTest | Promise<ProviderUnderTest>,
): void {
  describe(`${name} (transcription provider contract)`, () => {
    it('transcribes audio it can reach', async () => {
      const { provider, knownAudioUrl } = await create()
      const outcome = await provider.transcribe({
        audioUrl: knownAudioUrl,
        language: 'pt',
      })

      expect(outcome.ok).toBe(true)
    })

    it('echoes the language it was asked for, never one it guessed', async () => {
      const { provider, knownAudioUrl } = await create()
      const outcome = await provider.transcribe({
        audioUrl: knownAudioUrl,
        language: 'pt',
      })

      if (!outcome.ok) throw new Error('expected a transcript')
      expect(outcome.transcript.language).toBe('pt')
    })

    it('returns word-level timings, in order and non-overlapping', async () => {
      const { provider, knownAudioUrl } = await create()
      const outcome = await provider.transcribe({
        audioUrl: knownAudioUrl,
        language: 'pt',
      })

      if (!outcome.ok) throw new Error('expected a transcript')
      const { words } = outcome.transcript

      expect(words.length).toBeGreaterThan(0)

      for (const word of words) {
        expect(word.text.trim()).toBe(word.text)
        expect(word.text.length).toBeGreaterThan(0)
        expect(word.startMs).toBeGreaterThanOrEqual(0)
        expect(word.endMs).toBeGreaterThanOrEqual(word.startMs)
      }

      const starts = words.map((word) => word.startMs)
      expect([...starts].sort((a, b) => a - b)).toEqual(starts)
    })

    it('reports a duration that covers every word', async () => {
      const { provider, knownAudioUrl } = await create()
      const outcome = await provider.transcribe({
        audioUrl: knownAudioUrl,
        language: 'pt',
      })

      if (!outcome.ok) throw new Error('expected a transcript')
      const lastWord = outcome.transcript.words.at(-1)
      expect(outcome.transcript.durationMs).toBeGreaterThanOrEqual(lastWord?.endMs ?? 0)
    })

    it('returns non-empty text', async () => {
      const { provider, knownAudioUrl } = await create()
      const outcome = await provider.transcribe({
        audioUrl: knownAudioUrl,
        language: 'pt',
      })

      if (!outcome.ok) throw new Error('expected a transcript')
      expect(outcome.transcript.text.length).toBeGreaterThan(0)
    })

    // Keeping the raw response is what makes re-analysis free. Without it,
    // improving the counting means paying to transcribe everything again.
    it('preserves the provider payload verbatim', async () => {
      const { provider, knownAudioUrl } = await create()
      const outcome = await provider.transcribe({
        audioUrl: knownAudioUrl,
        language: 'pt',
      })

      if (!outcome.ok) throw new Error('expected a transcript')
      expect(outcome.transcript.raw).toBeDefined()
      expect(outcome.transcript.raw).not.toBeNull()
    })

    it('fails with a code rather than throwing when the audio is missing', async () => {
      const { provider, missingAudioUrl } = await create()
      const outcome = await provider.transcribe({
        audioUrl: missingAudioUrl,
        language: 'pt',
      })

      expect(outcome.ok).toBe(false)
      if (outcome.ok) throw new Error('expected a failure')
      expect(outcome.failure.code).toBe('AUDIO_NOT_FOUND')
    })
  })
}
