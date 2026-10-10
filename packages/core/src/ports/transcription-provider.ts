import type { AudioLanguage } from '../domain/audio-language.js'
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
  /**
   * Where the transcriber itself started each run of speech.
   *
   * The only thing in the response that knows a *different person* began
   * talking. Reported from a real episode: three turns ran onto one line
   * because no full stop was written between them, and the transcriber's
   * own boundaries sat at all three joins.
   *
   * Empty when it reported none — a worse transcript, not an unusable one,
   * so the lines fall back to breaking on punctuation alone.
   */
  readonly segmentStartsMs: readonly number[]
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
   * Always stated, never auto-detected.
   *
   * Detection misfires on accented and code-switched speech, and an episode
   * silently transcribed as the wrong language produces fluent nonsense that
   * still counts. Chosen per episode and recorded with it (ADR 0022), so
   * what it was transcribed as is a fact about the episode rather than a
   * property of whoever is reading.
   */
  readonly language: AudioLanguage
  /**
   * What the chunk before this one ended up saying, if there was one.
   *
   * An episode is longer than the hourly allowance, so it is cut into chunks
   * and each is sent on its own (ADR 0020) — which means every chunk but the
   * first starts mid-conversation knowing nothing about it. Measured on a
   * real episode: the same chunk transcribed cold lost a whole clause that
   * the prompted run recovered, and its punctuation and casing restarted
   * from scratch at the join.
   *
   * Only ever the preceding transcript, never a glossary of names. A list of
   * vocabulary was measured too and made the output worse — the model copies
   * the *shape* of what it is given, so a list came back as a list, with
   * labels stamped through the speech.
   */
  readonly precedingText?: string | undefined
}

export interface TranscriptionProvider {
  transcribe(request: TranscriptionRequest): Promise<TranscriptionOutcome>
}
