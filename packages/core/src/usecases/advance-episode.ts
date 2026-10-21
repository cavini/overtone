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
import type {
  TranscriptionFailure,
  TranscriptionProvider,
} from '../ports/transcription-provider.js'
import { annotate } from '../analysis/annotate.js'
import { stitchBoundaries, stitchChunks } from '../analysis/chunking.js'
import { applyCorrections, type Correction } from '../analysis/corrections.js'
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
   * What somebody typed in place of what the transcriber heard (US-049).
   *
   * Passed in rather than fetched, the same as the topics above: a handful
   * of rows the caller already has, and one less port for a thing that is
   * not an external service.
   */
  readonly corrections?: readonly Correction[]
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

/**
 * The refusals a retry cannot help with.
 *
 * Deliberately a list of what is *final* rather than of what is worth
 * retrying: a code nobody has classified yet should cost one more request,
 * not the episode. The adapter reasons the same way about HTTP statuses it
 * does not recognise.
 *
 * `AUDIO_UNREADABLE` is a file that does not decode, and
 * `PROVIDER_RESPONSE_INVALID` is the API having changed shape under us. Both
 * fail identically however many times they are asked, so both are worth
 * taking out of the queue — which is what `failed` does.
 */
const PERMANENT_FAILURES: ReadonlySet<TranscriptionFailure['code']> = new Set([
  'AUDIO_UNREADABLE',
  'PROVIDER_RESPONSE_INVALID',
])

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
      /*
       * Written down only when a retry cannot help.
       *
       * `failed` is terminal in practice, whatever it looks like: the
       * scheduler selects the in-flight statuses (ADR 0027), so nothing ever
       * picks a failed episode up again. Writing it for a blip threw away
       * the one distinction the adapter exists to draw — retryable versus
       * not — and cost the whole episode, out of the hundreds of requests a
       * two-hour one makes.
       *
       * Episode 41 went exactly this way. Groq fetches the audio by signed
       * URL rather than being handed the bytes, so a fetch it could not
       * complete comes back as `AUDIO_NOT_FOUND` — a statement about one
       * request, not about audio that is gone. It answered that once for
       * chunk 1 and the episode was dead, with its remaining eight chunks
       * still in the bucket and the library still showing a spinner.
       *
       * The episode is left in `transcribing`, set above, so the next
       * scheduled run tries the same chunk again. That is the same shape as
       * waiting for the allowance to refill, which is already the ordinary
       * case — a pause, not a verdict.
       */
      if (PERMANENT_FAILURES.has(transcribed.failure.code)) {
        await store.setStatus(request.episodeId, 'failed', transcribed.failure)
      }

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
      providerModel: transcribed.transcript.providerModel,
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

  /*
   * Every chunk is in. Stitch, analyse, store.
   *
   * Once, here, rather than after each chunk. Re-analysing on every step
   * would be `O(chunks²)` in the work — chunk one analysing a thirteenth of
   * the episode, chunk thirteen analysing all of it, for about seven times
   * the total — and each step runs inside a serverless invocation with a
   * ceiling on it. A per-chunk step therefore costs one transcription and
   * nothing else; the whole analysis is paid for once, at the end.
   */
  await store.setStatus(request.episodeId, 'analyzing')

  const language = request.language ?? DEFAULT_AUDIO_LANGUAGE

  const stored = await chunks.transcripts(request.episodeId)
  /*
   * Corrections go on before anything is counted, which is the whole point
   * of them: a fixed line changes the words, and the words are what every
   * number is. Tokens, terms, running jokes, the segments the reader pages
   * through and the text search reads — all of it comes off this one array.
   */
  /*
   * Where the episode actually ends, from the chunk plan rather than from
   * the words.
   *
   * The last chunk has no next offset to be bounded by, and the transcriber
   * overruns it as readily as any other: measured across thirty real
   * episodes, three ran past their own end — by 7, 8 and 30 seconds — so a
   * citation pointed at audio that is not there. The plan knows the length
   * because the plan is what cut the audio.
   */
  const episodeEndMs = request.chunks.reduce((end, chunk) => Math.max(end, chunk.endMs), 0)

  const words = applyCorrections(
    stitchChunks(stored, episodeEndMs > 0 ? episodeEndMs : undefined),
    request.corrections ?? [],
  )
  // The transcriber's own line breaks, moved into episode time alongside the
  // words they belong to.
  const boundaries = stitchBoundaries(stored)
  const tokens = tokeniseTimed(words, language)

  const distinctForms = [...new Set(tokens.map((token) => token.surface))]
  // Both in one step, over the same forms. The second is how an invented
  // verb is told from a real one (ADR 0029).
  const annotated = annotate(
    tokens,
    await lemmas.lookup(distinctForms, language),
    language,
    await lemmas.verbForms(distinctForms, language),
  )

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
      /*
       * What actually ran, read back off the chunks.
       *
       * This was a hard-coded string, so every episode claimed the same
       * model whatever had really produced it — including after the switch
       * to the full one (ADR 0024). The one thing the column is for is
       * tracing a count to its source.
       */
      providerModel: stored.find((chunk) => chunk.providerModel !== undefined)?.providerModel ?? 'unknown',
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
