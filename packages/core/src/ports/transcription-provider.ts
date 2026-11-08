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
  /**
   * What it was transcribed as — told, or heard when it was told nothing.
   *
   * Narrowed to a language this codebase has a pack for, rather than the
   * provider's own spelling. Groq answers `"portuguese"`, and that string
   * travelling onward would miss both stop-word lists and both halves of
   * the dictionary while still looking like an answer.
   */
  readonly language: AudioLanguage
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
   * It heard a language Overtone has no analysis for.
   *
   * Only reachable when nothing was stated, so only ever a probe. Saying so
   * is the whole point: the alternative is defaulting, and defaulting means
   * Spanish audio analysed against Portuguese stop words and a dictionary
   * that will cheerfully lemmatise about half of it. Carries what it heard
   * so the reader is told what was wrong rather than merely that something
   * was.
   */
  | { readonly code: 'LANGUAGE_NOT_SUPPORTED'; readonly heard: string }

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
   * What to transcribe it as — or nothing, to be told what it is.
   *
   * Stated for every chunk of a real episode, because the episode's
   * language is settled once, before any of them is sent, and a chunk left
   * to decide for itself could disagree with the chunk before it and be
   * stitched into the same transcript regardless.
   *
   * Omitted only to ask. That is a probe: a half-minute of audio sampled
   * away from the ends of the episode, whose entire purpose is to come back
   * with a language (`planLanguageProbes`). The risk detection carries has
   * not gone away — it is handled by sampling three windows rather than one
   * and by checking the answer against the transcript's own function words
   * afterwards, neither of which a caller of this port can see.
   */
  readonly language?: AudioLanguage | undefined
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
