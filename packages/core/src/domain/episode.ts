/**
 * Where an episode is in the pipeline.
 *
 * These six strings are the contract. They are stored values that tests
 * assert literally — the words a reader sees come from the message catalogue,
 * so `uploaded` reads as *Enviado* or *Uploaded* depending on the reader.
 * Never store the label, and never branch on it.
 */
export type EpisodeStatus =
  | 'uploaded'
  | 'transcribing'
  | 'analyzing'
  | 'ready'
  | 'failed'
  | 'deleting'

/** Still working. Not finished, but not broken either. */
export const IN_FLIGHT_STATUSES: ReadonlySet<EpisodeStatus> = new Set([
  'uploaded',
  'transcribing',
  'analyzing',
])

/**
 * One episode, as the library and the series view need it.
 *
 * A read model rather than an entity: it is what a repository hands back and
 * what a page renders, carrying no behaviour and no message text.
 */
export interface EpisodeSummary {
  readonly id: string
  readonly number: number
  readonly title: string
  readonly recordedOn: string
  readonly status: EpisodeStatus
  readonly durationMs: number
  readonly wordTokens: number
  readonly uniqueTerms: number
}

/** How often one topic came up in one episode. */
export interface TopicTally {
  readonly episodeId: string
  readonly topicId: string
  readonly count: number
}
