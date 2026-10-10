import type { ChunkTranscript } from '../domain/audio-chunk.js'
import { DEFAULT_AUDIO_LANGUAGE, type AudioLanguage } from '../domain/audio-language.js'
import type { Topic } from '../domain/topic.js'
import type { AllowanceStore } from '../ports/allowance-store.js'
import type { ChunkStore } from '../ports/chunk-store.js'
import type { Clock } from '../ports/clock.js'
import type {
  EpisodeFailure,
  EpisodeStore,
  StoredAnalysis,
  StoredMention,
} from '../ports/episode-store.js'
import type { LemmaRepository } from '../ports/lemma-repository.js'
import type { TranscriptionProvider } from '../ports/transcription-provider.js'
import { annotate } from '../analysis/annotate.js'
import { stitchBoundaries, stitchChunks } from '../analysis/chunking.js'
import { countTerms } from '../analysis/count-terms.js'
import { findMentions } from '../analysis/find-mentions.js'
import { nextChunkToSend } from '../analysis/pacing.js'
import { PIPELINE_VERSION } from '../analysis/pipeline-version.js'
import { precedingTail } from '../analysis/preceding-tail.js'
import { toSegments } from '../analysis/to-segments.js'
import { tokeniseTimed } from '../analysis/tokenise-timed.js'
import { VOCABULARY_VERSION } from '../analysis/vocabulary.js'

const MS_PER_MINUTE = 60_000
const NORMALIZATION_VERSION = 1

/** A chunk the browser has already split, encoded and uploaded. */
export interface UploadedChunk {
  readonly index: number
  readonly startMs: number
  readonly endMs: number
  readonly audioUrl: string
}

export interface AdvanceEpisodeRequest {
  readonly episodeId: string
  readonly chunks: readonly UploadedChunk[]
  readonly topics: readonly Topic[]
  /**
   * What the audio is spoken in.
   *
   * A property of the episode, settled when it was uploaded — not of
   * whoever happens to be looking at it now (ADR 0022). Defaults to
   * Brazilian Portuguese, which is what this show is.
   */
  readonly language?: AudioLanguage
}

export interface AdvanceEpisodeDependencies {
  readonly transcription: TranscriptionProvider
  readonly lemmas: LemmaRepository
  readonly chunks: ChunkStore
  readonly allowance: AllowanceStore
  readonly store: EpisodeStore
  readonly clock: Clock
}

export type AdvanceEpisodeOutcome =
  | { readonly state: 'transcribed'; readonly chunkIndex: number; readonly remaining: number }
  | {
      readonly state: 'waiting'
      readonly reason: 'HOURLY_ALLOWANCE_EXHAUSTED' | 'DAILY_ALLOWANCE_EXHAUSTED'
      readonly retryAfterMs: number
    }
  | { readonly state: 'ready' }
  | { readonly state: 'failed'; readonly failure: EpisodeFailure }

function perMinute(count: number, durationMs: number): number {
  if (durationMs <= 0) return 0
  return Math.round(count / (durationMs / MS_PER_MINUTE))
}

/**
 * Carries an episode forward by one step.
 *
 * A step function rather than a loop, because the work genuinely cannot be
 * done in one go: the free tier spends its hourly allowance on seconds of
 * audio, and an episode of this show is longer than a whole hour's worth
 * (ADR 0020). So transcription spans hours and process lifetimes, and each
 * call does as much as it is permitted to and says what happens next.
 *
 * **Waiting is a normal state here, not a failure.** Marking the episode
 * failed because the hour is spent would turn a routine pause into something
 * that looks broken, and would lose the chunks already paid for.
 */
export async function advanceEpisode(
  request: AdvanceEpisodeRequest,
  deps: AdvanceEpisodeDependencies,
): Promise<AdvanceEpisodeOutcome> {
  const { transcription, lemmas, chunks, allowance, store, clock } = deps

  const done = await chunks.transcribedIndexes(request.episodeId)
  const decision = nextChunkToSend(
    request.chunks,
    done,
    await allowance.read(),
    clock.now(),
  )

  if (decision.send === false && decision.reason !== 'COMPLETE') {
    // Keep the episode in `transcribing`: it is still in progress, and the
    // reason it is paused belongs in the progress message, not in a status.
    await store.setStatus(request.episodeId, 'transcribing')
    return {
      state: 'waiting',
      reason: decision.reason,
      retryAfterMs: decision.retryAfterMs,
    }
  }

  if (decision.send === true) {
    const { chunk } = decision
    const uploaded = request.chunks.find((candidate) => candidate.index === chunk.index)

    /* c8 ignore next -- unreachable: the plan the decision came from is this
       same array. */
    if (uploaded === undefined) return { state: 'ready' }

    await store.setStatus(request.episodeId, 'transcribing')

    // What the chunk before this one said, so it does not start the
    // conversation over at the join. One row, not the whole episode.
    const before = await chunks.transcript(request.episodeId, chunk.index - 1)
    const preceding = precedingTail(before === undefined ? [] : [before], chunk.index)

    const transcribed = await transcription.transcribe({
      audioUrl: uploaded.audioUrl,
      language: request.language ?? DEFAULT_AUDIO_LANGUAGE,
      ...(preceding === undefined ? {} : { precedingText: preceding }),
    })

    if (!transcribed.ok) {
      await store.setStatus(request.episodeId, 'failed', transcribed.failure)
      return { state: 'failed', failure: transcribed.failure }
    }

    // Store before recording the spend. A crash between the two then costs an
    // under-count of the allowance, which self-corrects within the hour —
    // rather than losing a chunk that has already been paid for out of a
    // budget of three episodes a day.
    await chunks.save(request.episodeId, {
      index: chunk.index,
      offsetMs: uploaded.startMs,
      words: transcribed.transcript.words,
      segmentStartsMs: transcribed.transcript.segmentStartsMs,
    })
    // Hand the provider's own reading straight through. It is ground truth
    // about a balance we otherwise only estimate, and it costs nothing
    // (ADR 0021).
    await allowance.record(uploaded.endMs - uploaded.startMs, transcribed.observedAllowance)

    return {
      state: 'transcribed',
      chunkIndex: chunk.index,
      remaining: request.chunks.length - done.length - 1,
    }
  }

  // Every chunk is in. Stitch, analyse, store.
  await store.setStatus(request.episodeId, 'analyzing')

  const language = request.language ?? DEFAULT_AUDIO_LANGUAGE

  const stored = await chunks.transcripts(request.episodeId)
  const words = stitchChunks(stored)
  // The transcriber's own line breaks, moved into episode time alongside the
  // words they belong to.
  const boundaries = stitchBoundaries(stored)
  const tokens = tokeniseTimed(words, language)

  const distinctForms = [...new Set(tokens.map((token) => token.surface))]
  const annotated = annotate(tokens, await lemmas.lookup(distinctForms, language), language)

  const counts = countTerms(annotated)
  const segments = toSegments(words, annotated, undefined, boundaries)
  const durationMs = words.at(-1)?.endMs ?? 0

  const mentions: StoredMention[] = request.topics.flatMap((topic) =>
    findMentions(annotated, topic).flatMap((mention) => {
      const first = annotated[mention.startIndex]
      const last = annotated[mention.endIndex]

      /* c8 ignore next -- unreachable: both indices index this same array. */
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
      provider: 'groq',
      providerModel: 'whisper-large-v3-turbo',
      rawProviderPayload: stored,
      fullText: words.map((word) => word.text).join(' '),
      normalizationVersion: NORMALIZATION_VERSION,
      vocabularyVersion: VOCABULARY_VERSION,
    },
    segments,
    insight: {
      pipelineVersion: PIPELINE_VERSION,
      durationMs,
      totalTokens: counts.totalTokens,
      wordTokens: counts.wordTokens,
      stopWordTokens: counts.stopWordTokens,
      fillerTokens: counts.fillerTokens,
      uniqueTerms: counts.uniqueTerms,
      wordsPerMinute: perMinute(counts.totalTokens, durationMs),
      fillersPerMinute: perMinute(counts.fillerTokens, durationMs),
    },
    termCounts: counts.terms,
    mentions,
  }

  await store.save(request.episodeId, analysis)
  await store.setStatus(request.episodeId, 'ready')

  return { state: 'ready' }
}
