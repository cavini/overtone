/**
 * Where an episode is in the pipeline.
 *
 * Declared as runtime data with the type derived from it, so the database's
 * column constraint and the application's type come from the same list and
 * cannot drift apart.
 *
 * These six strings are the contract. They are stored values that tests
 * assert literally — the words a reader sees come from the message catalogue,
 * so `uploaded` reads as *Enviado* or *Uploaded* depending on the reader.
 * Never store the label, and never branch on it.
 */
export const EPISODE_STATUSES = [
  'uploaded',
  'transcribing',
  'analyzing',
  'ready',
  'failed',
  'deleting',
] as const

export type EpisodeStatus = (typeof EPISODE_STATUSES)[number]

/** Still working. Not finished, but not broken either. */
export const SERIES_ROLES = ['owner', 'host'] as const
export type SeriesRole = (typeof SERIES_ROLES)[number]

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
  /** Null until someone says when it was recorded. */
  readonly recordedOn: string | null
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
