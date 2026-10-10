import type {
  Transcript,
  TranscriptionOutcome,
  TranscriptionProvider,
  TranscriptionRequest,
  TranscribedWord,
} from '../ports/transcription-provider.js'

const DEFAULT_MS_PER_WORD = 400

/**
 * Builds a transcript with plausible, evenly spaced timings.
 *
 * Real timings are ragged, but tests need them to be predictable, so a fixed
 * cadence is the honest simplification: anything depending on the *shape* of
 * the timings rather than their exact values behaves identically.
 */
export function transcriptFromText(
  text: string,
  options: { readonly startMs?: number; readonly msPerWord?: number } = {},
): Transcript {
  const startMs = options.startMs ?? 0
  const msPerWord = options.msPerWord ?? DEFAULT_MS_PER_WORD
  const spellings = text.split(/\s+/).filter((word) => word.length > 0)

  const words: TranscribedWord[] = spellings.map((spelling, position) => ({
    text: spelling,
    startMs: startMs + position * msPerWord,
    endMs: startMs + position * msPerWord + msPerWord,
  }))

  const lastWord = words.at(-1)

  /*
   * A boundary where each sentence starts, which is roughly what the real
   * transcriber reports. The fake has to produce these or every test using
   * it would exercise a transcript shape the real adapter never returns.
   */
  const segmentStartsMs = words
    .filter((_, position) => position === 0 || /[.!?…]$/u.test(words[position - 1]?.text ?? ''))
    .map((word) => word.startMs)

  return {
    provider: 'fake',
    providerModel: 'fixture',
    text: spellings.join(' '),
    words,
    segmentStartsMs,
    language: 'pt',
    durationMs: lastWord ? lastWord.endMs : startMs,
    raw: { provider: 'fake', words },
  }
}

/**
 * Stands in for the transcription service everywhere, including end-to-end
 * tests.
 *
 * The suite must never call the real provider: the free allowance is shared
 * across every user of the app, so a test run that spent it would take the
 * product down. That makes this an availability requirement rather than a
 * convenience — and it is why this class is held to the same contract suite
 * as the real adapter.
 */
export class FakeTranscriptionProvider implements TranscriptionProvider {
  private readonly fixtures: Map<string, Transcript>

  constructor(fixtures: Iterable<readonly [string, Transcript]> = []) {
    this.fixtures = new Map(fixtures)
  }

  static withText(audioUrl: string, text: string): FakeTranscriptionProvider {
    return new FakeTranscriptionProvider([[audioUrl, transcriptFromText(text)]])
  }

  set(audioUrl: string, transcript: Transcript): this {
    this.fixtures.set(audioUrl, transcript)
    return this
  }

  transcribe(request: TranscriptionRequest): Promise<TranscriptionOutcome> {
    const transcript = this.fixtures.get(request.audioUrl)

    if (transcript === undefined) {
      return Promise.resolve({ ok: false, failure: { code: 'AUDIO_NOT_FOUND' } })
    }

    return Promise.resolve({
      ok: true,
      transcript: { ...transcript, language: request.language },
    })
  }
}
