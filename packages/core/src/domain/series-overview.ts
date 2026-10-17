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

/**
 * One word, totalled over every analysed episode.
 *
 * `episodes` is the honest half of the number. A word said four thousand
 * times in twenty-three episodes is how the group talks; the same total in
 * one episode is one conversation — and a column of bare totals cannot tell
 * those apart.
 */
export interface SeriesTermTotal {
  /** The lemma, so `falar` carries `falou` and `falando` with it. */
  readonly term: string
  readonly total: number
  /** How many analysed episodes it appears in at all. */
  readonly episodes: number
  /** Whether the grouping was a dictionary lemma or a stemmer's guess. */
  readonly heuristic: boolean
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
  /**
   * The words said most across the whole series, biggest first.
   *
   * Aggregated on request rather than stored. Measured on a real library:
   * the top twenty-five over twenty-four episodes takes ~106 ms, and
   * totalling *every* term takes ~90 ms — the same ballpark as one search,
   * which is already a page anybody can load. So there is nothing here to
   * precompute, nothing to keep in step with corrections, and nothing to
   * hide behind an admin command.
   */
  readonly topTerms: readonly SeriesTermTotal[]
}
