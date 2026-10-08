import type { TermCount } from './term.js'

/**
 * Everything one episode's page needs, and nothing a database row would carry.
 *
 * This is a response model rather than an entity: it crosses the boundary out
 * of the use case, so it holds numbers and plain strings only — no message
 * text, since nothing down here knows which language the reader wants.
 */
export interface EpisodeAnalysis {
  readonly durationMs: number
  readonly totalTokens: number
  readonly wordTokens: number
  readonly stopWordTokens: number
  readonly fillerTokens: number
  readonly uniqueTerms: number
  readonly wordsPerMinute: number
  readonly fillersPerMinute: number
  readonly topTerms: readonly TermCount[]
  readonly pipelineVersion: number
  readonly vocabularyVersion: number
}
