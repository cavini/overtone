import type { EpisodeSummary } from './episode.js'

/**
 * How far along a series is.
 *
 * This matters more here than it would elsewhere. Nothing is imported, so a
 * series genuinely starts at zero and grows one episode at a time — which
 * means the cross-episode comparison the product is built around does not
 * exist for the first few weeks. These are the common case early on, not edge
 * cases, and each one deserves a designed screen rather than an empty chart.
 */
export type SeriesState = 'empty' | 'first-episode' | 'comparable'

export type TopicTrend = 'up' | 'down' | 'flat' | 'unknown'

export interface TopicCountInEpisode {
  readonly episodeNumber: number
  readonly count: number
}

export interface SeriesTopicTrend {
  readonly topicId: string
  readonly topicName: string
  readonly total: number
  /**
   * Oldest first, so the series reads left to right, with an explicit zero
   * for an episode the joke never came up in. A gap would look like missing
   * data; a zero is the finding.
   */
  readonly perEpisode: readonly TopicCountInEpisode[]
  readonly trend: TopicTrend
}

export interface SeriesOverview {
  readonly state: SeriesState
  readonly episodeCount: number
  readonly readyCount: number
  readonly processingCount: number
  /** Over analysed episodes only — the ones with real numbers. */
  readonly totalDurationMs: number
  readonly totalWords: number
  readonly episodes: readonly EpisodeSummary[]
  readonly topics: readonly SeriesTopicTrend[]
}
