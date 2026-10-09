import type { EpisodeStatus } from '../domain/episode.js'
import type { TermCount } from '../domain/term.js'
import type { TranscriptSegment } from '../domain/transcript-segment.js'
import type { TranscriptionFailure } from './transcription-provider.js'

export interface StoredTranscript {
  readonly provider: string
  readonly providerModel: string
  /**
   * The provider's answer, untouched. Never discarded: it is what lets every
   * derived number be recomputed when the analysis improves, without paying
   * to transcribe the episode again.
   */
  readonly rawProviderPayload: unknown
  readonly fullText: string
  readonly normalizationVersion: number
  readonly vocabularyVersion: number
}

export interface StoredInsight {
  readonly pipelineVersion: number
  readonly durationMs: number
  readonly totalTokens: number
  readonly wordTokens: number
  readonly stopWordTokens: number
  readonly fillerTokens: number
  readonly uniqueTerms: number
  readonly wordsPerMinute: number
  readonly fillersPerMinute: number
}

export interface StoredMention {
  readonly topicId: string
  readonly matchedText: string
  readonly startMs: number
  readonly endMs: number
}

/**
 * Everything one run of the pipeline produced.
 *
 * Handed over in one piece so an implementation can write it in a single
 * transaction. A half-stored analysis — counts without the transcript they
 * came from — would be worse than none at all, because it looks finished.
 */
export interface StoredAnalysis {
  readonly transcript: StoredTranscript
  readonly segments: readonly TranscriptSegment[]
  readonly insight: StoredInsight
  readonly termCounts: readonly TermCount[]
  readonly mentions: readonly StoredMention[]
}

/** Why an episode stopped. A code and its data, never a sentence. */
export type EpisodeFailure =
  | TranscriptionFailure
  | { readonly code: 'ANALYSIS_NOT_STORED' }

export interface EpisodeStore {
  setStatus(
    episodeId: string,
    status: EpisodeStatus,
    failure?: EpisodeFailure,
  ): Promise<void>
  save(episodeId: string, analysis: StoredAnalysis): Promise<void>
}
