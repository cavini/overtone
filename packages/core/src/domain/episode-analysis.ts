import type { TermCount } from './term.js'

/**
 * One occurrence of a topic, located in the audio rather than in the token
 * stream.
 *
 * Token indices are an internal detail; a timestamp is what a player can
 * seek to, which is the only form of provenance a listener can check.
 */
export interface TopicMention {
  readonly matchedText: string
  readonly startMs: number
  readonly endMs: number
}

/** How often one running joke came up, and where. */
export interface TopicMentionCount {
  readonly topicId: string
  readonly topicName: string
  readonly count: number
  readonly mentions: readonly TopicMention[]
}

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
  readonly topics: readonly TopicMentionCount[]
  readonly pipelineVersion: number
  readonly vocabularyVersion: number
}
