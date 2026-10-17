import type { EpisodeSummary, TopicTally } from '../domain/episode.js'
import type { Topic } from '../domain/topic.js'
import type { SeriesTermTotal } from '../domain/series-overview.js'

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
  /**
   * The words said most across the series, already totalled.
   *
   * Totalled by the database, because summing is what a database is for and
   * the alternative is reading every term row of every episode into memory
   * to add them up here. At a hundred episodes that is a hundred and eighty
   * thousand rows to move in order to return twenty-five.
   */
  topTerms(seriesId: string, howMany: number): Promise<readonly SeriesTermTotal[]>
}

export type { EpisodeSummary, TopicTally, SeriesTermTotal }
