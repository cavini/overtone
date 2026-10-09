import type { Topic } from '../domain/topic.js'
import type {
  EpisodeFailure,
  EpisodeStore,
  StoredAnalysis,
  StoredMention,
} from '../ports/episode-store.js'
import type { LemmaRepository } from '../ports/lemma-repository.js'
import type { TranscriptionProvider } from '../ports/transcription-provider.js'
import { annotate } from '../analysis/annotate.js'
import { countTerms } from '../analysis/count-terms.js'
import { findMentions } from '../analysis/find-mentions.js'
import { PIPELINE_VERSION } from '../analysis/pipeline-version.js'
import { toSegments } from '../analysis/to-segments.js'
import { tokeniseTimed } from '../analysis/tokenise-timed.js'
import { VOCABULARY_VERSION } from '../analysis/vocabulary.js'

const MS_PER_MINUTE = 60_000
const NORMALIZATION_VERSION = 1

export interface ProcessEpisodeRequest {
  readonly episodeId: string
  readonly audioUrl: string
  readonly topics: readonly Topic[]
}

export interface ProcessEpisodeDependencies {
  readonly transcription: TranscriptionProvider
  readonly lemmas: LemmaRepository
  readonly store: EpisodeStore
}

export type ProcessEpisodeOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: EpisodeFailure }

function perMinute(count: number, durationMs: number): number {
  if (durationMs <= 0) return 0
  return Math.round(count / (durationMs / MS_PER_MINUTE))
}

/**
 * Takes an uploaded episode all the way to counted terms.
 *
 * The status transitions are the contract, not bookkeeping. Someone is
 * watching a progress indicator, and each status is a different sentence on
 * screen — so the order matters, and `ready` must mean the numbers are
 * actually there. Setting it before the write would show a page that claims
 * to be finished and displays zero of everything, which is the worst failure
 * available: it looks like an answer.
 *
 * Names no vendor and touches no database. Transcription, the dictionary and
 * storage all arrive as ports.
 */
export async function processEpisode(
  request: ProcessEpisodeRequest,
  { transcription, lemmas, store }: ProcessEpisodeDependencies,
): Promise<ProcessEpisodeOutcome> {
  const fail = async (failure: EpisodeFailure): Promise<ProcessEpisodeOutcome> => {
    await store.setStatus(request.episodeId, 'failed', failure)
    return { ok: false, failure }
  }

  await store.setStatus(request.episodeId, 'transcribing')

  const transcribed = await transcription.transcribe({
    audioUrl: request.audioUrl,
    language: 'pt',
  })

  // No dictionary lookup for a transcript we never got.
  if (!transcribed.ok) return fail(transcribed.failure)

  await store.setStatus(request.episodeId, 'analyzing')

  const { transcript } = transcribed
  const tokens = tokeniseTimed(transcript.words)

  const distinctForms = [...new Set(tokens.map((token) => token.surface))]
  const annotated = annotate(tokens, await lemmas.lookup(distinctForms))

  const counts = countTerms(annotated)
  const segments = toSegments(transcript.words, annotated)

  const mentions: StoredMention[] = request.topics.flatMap((topic) =>
    findMentions(annotated, topic).flatMap((mention) => {
      const first = annotated[mention.startIndex]
      const last = annotated[mention.endIndex]

      /* c8 ignore next -- unreachable: both indices come from this array. */
      if (first === undefined || last === undefined) return []

      return [
        {
          topicId: topic.id,
          matchedText: mention.matchedText,
          startMs: first.startMs,
          endMs: last.endMs,
        },
      ]
    }),
  )

  const analysis: StoredAnalysis = {
    transcript: {
      provider: transcript.provider,
      providerModel: transcript.providerModel,
      rawProviderPayload: transcript.raw,
      fullText: transcript.text,
      normalizationVersion: NORMALIZATION_VERSION,
      vocabularyVersion: VOCABULARY_VERSION,
    },
    segments,
    insight: {
      pipelineVersion: PIPELINE_VERSION,
      durationMs: transcript.durationMs,
      totalTokens: counts.totalTokens,
      wordTokens: counts.wordTokens,
      stopWordTokens: counts.stopWordTokens,
      fillerTokens: counts.fillerTokens,
      uniqueTerms: counts.uniqueTerms,
      wordsPerMinute: perMinute(counts.totalTokens, transcript.durationMs),
      fillersPerMinute: perMinute(counts.fillerTokens, transcript.durationMs),
    },
    termCounts: counts.terms,
    mentions,
  }

  try {
    await store.save(request.episodeId, analysis)
  } catch {
    // Whatever went wrong, the episode must not be left looking finished.
    return fail({ code: 'ANALYSIS_NOT_STORED' })
  }

  await store.setStatus(request.episodeId, 'ready')
  return { ok: true }
}
