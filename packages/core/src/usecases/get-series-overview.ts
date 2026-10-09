import { IN_FLIGHT_STATUSES, type EpisodeSummary } from '../domain/episode.js'
import type {
  SeriesOverview,
  SeriesState,
  SeriesTopicTrend,
  TopicTrend,
} from '../domain/series-overview.js'
import type { SeriesRepository } from '../ports/series-repository.js'
import { compareByCountThenLabel } from '../analysis/ranking.js'

export interface GetSeriesOverviewRequest {
  readonly seriesId: string
}

export interface GetSeriesOverviewDependencies {
  readonly series: SeriesRepository
}

/**
 * A trend needs two points. One episode is a fact, not a direction, and
 * calling it one would invent information the group does not have.
 */
function trendOf(counts: readonly number[]): TopicTrend {
  if (counts.length < 2) return 'unknown'

  const latest = counts.at(-1) ?? 0
  const previous = counts.at(-2) ?? 0

  if (latest > previous) return 'up'
  if (latest < previous) return 'down'
  return 'flat'
}

/**
 * Based on analysed episodes, not uploaded ones.
 *
 * An episode halfway through the pipeline has no numbers, so it cannot be
 * compared to anything — counting it would promise a comparison the page
 * cannot draw.
 */
function stateOf(readyCount: number): SeriesState {
  if (readyCount === 0) return 'empty'
  if (readyCount === 1) return 'first-episode'
  return 'comparable'
}

/**
 * The series view: every episode side by side, and each running joke across
 * all of them.
 *
 * This is the page the product exists for. A single episode's word counts are
 * mildly interesting; *"we said it four times more this month than last"* is
 * the thing worth coming back for.
 *
 * It reads stored per-episode aggregates rather than re-scanning transcripts,
 * so the cost does not grow with the length of the archive — and the same
 * aggregates answer the assistant's "how many times ever" later.
 */
export async function getSeriesOverview(
  request: GetSeriesOverviewRequest,
  { series }: GetSeriesOverviewDependencies,
): Promise<SeriesOverview> {
  const [episodes, topics, tallies] = await Promise.all([
    series.episodes(request.seriesId),
    series.topics(request.seriesId),
    series.topicTallies(request.seriesId),
  ])

  const newestFirst = [...episodes].sort((a, b) => b.number - a.number)
  const analysed: EpisodeSummary[] = newestFirst
    .filter((episode) => episode.status === 'ready')
    .sort((a, b) => a.number - b.number)

  const processingCount = episodes.filter((episode) =>
    IN_FLIGHT_STATUSES.has(episode.status),
  ).length

  // Keyed by episode and topic so a tally for an episode outside this series,
  // or a topic nobody tracks any more, simply never gets read.
  const counts = new Map<string, number>()
  for (const tally of tallies) {
    counts.set(`${tally.episodeId}:${tally.topicId}`, tally.count)
  }

  const trends: SeriesTopicTrend[] = topics
    .map((topic) => {
      const perEpisode = analysed.map((episode) => ({
        episodeNumber: episode.number,
        count: counts.get(`${episode.id}:${topic.id}`) ?? 0,
      }))

      return {
        topicId: topic.id,
        topicName: topic.name,
        total: perEpisode.reduce((sum, entry) => sum + entry.count, 0),
        perEpisode,
        trend: trendOf(perEpisode.map((entry) => entry.count)),
      }
    })
    .sort((a, b) =>
      compareByCountThenLabel(
        { count: a.total, label: a.topicName },
        { count: b.total, label: b.topicName },
      ),
    )

  return {
    state: stateOf(analysed.length),
    episodeCount: episodes.length,
    readyCount: analysed.length,
    processingCount,
    totalDurationMs: analysed.reduce((sum, episode) => sum + episode.durationMs, 0),
    totalWords: analysed.reduce((sum, episode) => sum + episode.wordTokens, 0),
    episodes: newestFirst,
    topics: trends,
  }
}
