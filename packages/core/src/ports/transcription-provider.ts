import type { ObservedAllowance } from '../domain/observed-allowance.js'

/** One word, with the timing that lets a count link back to the audio. */
export interface TranscribedWord {
  readonly text: string
  readonly startMs: number
  readonly endMs: number
}

export interface Transcript {
  /** Who produced this, stored so a count can be traced to its source. */
  readonly provider: string
  readonly providerModel: string
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
 * What the provider said about its own remaining allowance, if it said
 * anything.
 *
 * Present on success and on failure alike, because the refusal that matters
 * most — being over the limit — is a failure, and it reports the balance too
 * (ADR 0021). Optional because a provider that stops reporting must not be
 * mistaken for one reporting an empty bucket.
 */
interface WithObservedAllowance {
  readonly observedAllowance?: ObservedAllowance | undefined
}

/**
 * Failure is part of the return type rather than an exception, so a caller
 * cannot forget that transcription is the one step that routinely fails.
 */
export type TranscriptionOutcome =
  | ({ readonly ok: true; readonly transcript: Transcript } & WithObservedAllowance)
  | ({ readonly ok: false; readonly failure: TranscriptionFailure } & WithObservedAllowance)

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
