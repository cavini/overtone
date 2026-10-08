import type { EpisodeAnalysis } from '../domain/episode-analysis.js'
import type { LemmaRepository } from '../ports/lemma-repository.js'
import type {
  TranscriptionFailure,
  TranscriptionProvider,
} from '../ports/transcription-provider.js'
import { annotate } from '../analysis/annotate.js'
import { countTerms } from '../analysis/count-terms.js'
import { normalize } from '../analysis/normalize.js'
import { PIPELINE_VERSION } from '../analysis/pipeline-version.js'
import { tokenise } from '../analysis/tokenise.js'
import { VOCABULARY_VERSION } from '../analysis/vocabulary.js'

const DEFAULT_TOP_TERMS = 25
const MS_PER_MINUTE = 60_000

export interface AnalyseEpisodeRequest {
  readonly audioUrl: string
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
  const tokens = tokenise(normalize(transcript.text))

  const distinctForms = [...new Set(tokens.map((token) => token.surface))]
  const dictionary = await lemmas.lookup(distinctForms)

  const counts = countTerms(annotate(tokens, dictionary))
  const limit = request.topTermLimit ?? DEFAULT_TOP_TERMS

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
      pipelineVersion: PIPELINE_VERSION,
      vocabularyVersion: VOCABULARY_VERSION,
    },
  }
}
