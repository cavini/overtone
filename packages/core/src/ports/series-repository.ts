import type { EpisodeSummary, TopicTally } from '../domain/episode.js'
import type { Topic } from '../domain/topic.js'

export interface SeriesRepository {
  episodes(seriesId: string): Promise<readonly EpisodeSummary[]>
  topics(seriesId: string): Promise<readonly Topic[]>
  /**
   * Pre-aggregated, one row per episode and topic.
   *
   * Reading stored per-episode counts rather than re-scanning transcripts is
   * what keeps the series view fast as the library grows — and it is the same
   * aggregate the assistant will later query, which is why it exists now.
   */
  topicTallies(seriesId: string): Promise<readonly TopicTally[]>
}

export type { EpisodeSummary, TopicTally }
