/** One word, with the timing that lets a count link back to the audio. */
export interface TranscribedWord {
  readonly text: string
  readonly startMs: number
  readonly endMs: number
}

export interface Transcript {
  readonly text: string
  readonly words: readonly TranscribedWord[]
  readonly language: string
  readonly durationMs: number
  /**
   * The provider's response, verbatim and untouched.
   *
   * Never discarded. It is how every derived number can be recomputed when
   * the analysis improves, without spending the transcription allowance a
   * second time.
   */
  readonly raw: unknown
}

/**
 * Why a transcription did not happen.
 *
 * Codes rather than messages: no layer below the presenter knows which
 * language the reader wants, so the text is assembled from a catalogue at the
 * edge.
 */
export type TranscriptionFailure =
  | { readonly code: 'AUDIO_NOT_FOUND' }
  | { readonly code: 'AUDIO_UNREADABLE' }
  | { readonly code: 'ALLOWANCE_EXHAUSTED'; readonly retryAfterMs: number }
  | { readonly code: 'PROVIDER_UNAVAILABLE' }
  /**
   * The service answered, but not in a shape we recognise.
   *
   * Its own category rather than folded into `PROVIDER_UNAVAILABLE`, because
   * the two mean different things: one is a transient outage worth retrying,
   * the other means the API changed under us and a retry will fail the same
   * way. Silently accepting an unexpected shape would be worse than either —
   * a transcript with no words still counts to zero, and zero looks like an
   * answer.
   */
  | { readonly code: 'PROVIDER_RESPONSE_INVALID' }

/**
 * Failure is part of the return type rather than an exception, so a caller
 * cannot forget that transcription is the one step that routinely fails.
 */
export type TranscriptionOutcome =
  | { readonly ok: true; readonly transcript: Transcript }
  | { readonly ok: false; readonly failure: TranscriptionFailure }

export interface TranscriptionRequest {
  /** Where the provider can fetch the audio. */
  readonly audioUrl: string
  /**
   * Always stated, never auto-detected. Detection misfires on accented and
   * code-switched speech, and an episode silently transcribed as the wrong
   * language would produce fluent nonsense that still counts.
   */
  readonly language: 'pt'
}

export interface TranscriptionProvider {
  transcribe(request: TranscriptionRequest): Promise<TranscriptionOutcome>
}
