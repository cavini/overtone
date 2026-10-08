import type {
  EpisodeAnalysis,
  TopicMentionCount,
} from '../domain/episode-analysis.js'
import type { Annotated, TimedToken } from '../domain/token.js'
import type { Topic } from '../domain/topic.js'
import type { LemmaRepository } from '../ports/lemma-repository.js'
import type {
  TranscriptionFailure,
  TranscriptionProvider,
} from '../ports/transcription-provider.js'
import { annotate } from '../analysis/annotate.js'
import { countTerms } from '../analysis/count-terms.js'
import { findMentions } from '../analysis/find-mentions.js'
import { PIPELINE_VERSION } from '../analysis/pipeline-version.js'
import { compareByCountThenLabel } from '../analysis/ranking.js'
import { tokeniseTimed } from '../analysis/tokenise-timed.js'
import { VOCABULARY_VERSION } from '../analysis/vocabulary.js'

const DEFAULT_TOP_TERMS = 25
const MS_PER_MINUTE = 60_000

export interface AnalyseEpisodeRequest {
  readonly audioUrl: string
  /** The running jokes being tracked for this series. */
  readonly topics?: readonly Topic[]
  readonly topTermLimit?: number
}

export interface AnalyseEpisodeDependencies {
  readonly transcription: TranscriptionProvider
  readonly lemmas: LemmaRepository
}

export type AnalyseEpisodeOutcome =
  | { readonly ok: true; readonly analysis: EpisodeAnalysis }
  | { readonly ok: false; readonly failure: TranscriptionFailure }

function perMinute(count: number, durationMs: number): number {
  if (durationMs <= 0) return 0
  return Math.round(count / (durationMs / MS_PER_MINUTE))
}

/**
 * Turns matches on the token stream into moments in the audio.
 *
 * Token indices never leave this file: a reader can seek to a timestamp, and
 * cannot do anything at all with an index.
 */
function countTopic(
  topic: Topic,
  tokens: ReadonlyArray<Annotated<TimedToken>>,
): TopicMentionCount {
  const mentions = findMentions(tokens, topic).flatMap((mention) => {
    const first = tokens[mention.startIndex]
    const last = tokens[mention.endIndex]

    /* c8 ignore next -- unreachable: both indices come from this same array.
       The guard exists only to satisfy `noUncheckedIndexedAccess`. */
    if (first === undefined || last === undefined) return []

    return [
      {
        matchedText: mention.matchedText,
        startMs: first.startMs,
        endMs: last.endMs,
      },
    ]
  })

  return {
    topicId: topic.id,
    topicName: topic.name,
    count: mentions.length,
    mentions,
  }
}

/**
 * Audio in, counted terms out.
 *
 * Names no vendor and touches no database. Transcription and the lemma
 * dictionary both arrive as ports, so swapping either is an adapter — which
 * is the only reason the transcription provider could be changed three times
 * during planning without this file moving.
 *
 * The dictionary lookup happens here rather than inside `annotate` so the
 * analysis functions stay pure: one bulk query for the forms this episode
 * actually used, then a plain map handed downwards.
 */
export async function analyseEpisode(
  request: AnalyseEpisodeRequest,
  { transcription, lemmas }: AnalyseEpisodeDependencies,
): Promise<AnalyseEpisodeOutcome> {
  const outcome = await transcription.transcribe({
    audioUrl: request.audioUrl,
    language: 'pt',
  })

  if (!outcome.ok) return { ok: false, failure: outcome.failure }

  const { transcript } = outcome

  // Tokenising per transcribed word rather than over the joined text is what
  // keeps every token's link to the audio.
  const tokens = tokeniseTimed(transcript.words)

  const distinctForms = [...new Set(tokens.map((token) => token.surface))]
  const dictionary = await lemmas.lookup(distinctForms)

  const annotated = annotate(tokens, dictionary)
  const counts = countTerms(annotated)
  const limit = request.topTermLimit ?? DEFAULT_TOP_TERMS

  const topics = (request.topics ?? [])
    .map((topic) => countTopic(topic, annotated))
    .sort((a, b) =>
      compareByCountThenLabel(
        { count: a.count, label: a.topicName },
        { count: b.count, label: b.topicName },
      ),
    )

  return {
    ok: true,
    analysis: {
      durationMs: transcript.durationMs,
      totalTokens: counts.totalTokens,
      wordTokens: counts.wordTokens,
      stopWordTokens: counts.stopWordTokens,
      fillerTokens: counts.fillerTokens,
      uniqueTerms: counts.uniqueTerms,
      wordsPerMinute: perMinute(counts.totalTokens, transcript.durationMs),
      fillersPerMinute: perMinute(counts.fillerTokens, transcript.durationMs),
      topTerms: counts.terms.slice(0, limit),
      topics,
      pipelineVersion: PIPELINE_VERSION,
      vocabularyVersion: VOCABULARY_VERSION,
    },
  }
}
