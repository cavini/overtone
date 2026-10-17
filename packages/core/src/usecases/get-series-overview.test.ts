// US-022, US-038, US-042 · the cross-episode view the product exists for
import { describe, expect, it } from 'vitest'
import type {
  EpisodeSummary,
  SeriesRepository,
  SeriesTermTotal,
  TopicTally,
} from '../ports/series-repository.js'
import type { Topic } from '../domain/topic.js'
import { getSeriesOverview, TOP_TERMS } from './get-series-overview.js'

const SERIES = 'series-1'

const GUARDACHUVA: Topic = { id: 't-guardachuva', name: 'Guardachuva', patterns: ['guardachuva'] }
const FEIJAO: Topic = { id: 't-feijao', name: 'Feijão', patterns: ['feijão'] }

const episode = (
  number: number,
  overrides: Partial<EpisodeSummary> = {},
): EpisodeSummary => ({
  id: `ep-${number}`,
  number,
  title: `Episódio ${number}`,
  recordedOn: `2026-0${number}-01`,
  status: 'ready',
  durationMs: 6_000_000,
  wordTokens: 10_000,
  uniqueTerms: 1_500,
  ...overrides,
})

/** What `topTerms` was asked for, so a test can check the ask itself. */
let askedFor: number | undefined

const repository = (
  episodes: readonly EpisodeSummary[],
  topics: readonly Topic[] = [],
  tallies: readonly TopicTally[] = [],
  terms: readonly SeriesTermTotal[] = [],
): SeriesRepository => ({
  episodes: () => Promise.resolve(episodes),
  topics: () => Promise.resolve(topics),
  topicTallies: () => Promise.resolve(tallies),
  topTerms: (_seriesId, howMany) => {
    askedFor = howMany
    return Promise.resolve(terms)
  },
})

const overviewOf = async (
  episodes: readonly EpisodeSummary[],
  topics: readonly Topic[] = [],
  tallies: readonly TopicTally[] = [],
  terms: readonly SeriesTermTotal[] = [],
) =>
  getSeriesOverview(
    { seriesId: SERIES },
    { series: repository(episodes, topics, tallies, terms) },
  )

const term = (name: string, total: number, episodes = 1): SeriesTermTotal => ({
  term: name,
  total,
  episodes,
  heuristic: false,
})

describe('getSeriesOverview', () => {
  // There is no back catalogue, so a series genuinely starts at nothing and
  // grows one episode at a time. These states are the common case for the
  // first few weeks, not edge cases.
  describe('while the series is still filling up', () => {
    it('says so when there is nothing at all', async () => {
      const overview = await overviewOf([])
      expect(overview.state).toBe('empty')
      expect(overview.episodeCount).toBe(0)
      expect(overview.topics).toEqual([])
    })

    it('says so when there is one episode and nothing to compare', async () => {
      const overview = await overviewOf([episode(1)])
      expect(overview.state).toBe('first-episode')
    })

    it('becomes comparable at the second episode', async () => {
      const overview = await overviewOf([episode(1), episode(2)])
      expect(overview.state).toBe('comparable')
    })

    it('counts an episode that is still processing but does not call it ready', async () => {
      const overview = await overviewOf([
        episode(1),
        episode(2, { status: 'transcribing' }),
      ])
      expect(overview.episodeCount).toBe(2)
      expect(overview.readyCount).toBe(1)
      expect(overview.processingCount).toBe(1)
    })

    // A series whose only episode is mid-pipeline has nothing to show yet.
    it('is still empty when its only episode has no numbers yet', async () => {
      const overview = await overviewOf([episode(1, { status: 'transcribing' })])
      expect(overview.state).toBe('empty')
    })
  })

  it('lists the newest episode first', async () => {
    const overview = await overviewOf([episode(1), episode(3), episode(2)])
    expect(overview.episodes.map((e) => e.number)).toEqual([3, 2, 1])
  })

  it('totals the series', async () => {
    const overview = await overviewOf([episode(1), episode(2)])
    expect(overview.totalDurationMs).toBe(12_000_000)
    expect(overview.totalWords).toBe(20_000)
  })

  describe('running jokes across the series', () => {
    const tallies: readonly TopicTally[] = [
      { episodeId: 'ep-1', topicId: 't-guardachuva', count: 4 },
      { episodeId: 'ep-2', topicId: 't-guardachuva', count: 9 },
      { episodeId: 'ep-1', topicId: 't-feijao', count: 2 },
    ]

    it('adds a joke up across every episode', async () => {
      const overview = await overviewOf([episode(1), episode(2)], [GUARDACHUVA, FEIJAO], tallies)
      expect(overview.topics.find((t) => t.topicName === 'Guardachuva')?.total).toBe(13)
    })

    it('reports a zero for an episode where it never came up', async () => {
      const overview = await overviewOf([episode(1), episode(2)], [FEIJAO], tallies)
      expect(overview.topics[0]?.perEpisode).toEqual([
        { episodeNumber: 1, count: 2 },
        { episodeNumber: 2, count: 0 },
      ])
    })

    // A watchlist entry that has never come up is information, not an
    // absence: it tells the group the bit has gone quiet.
    it('keeps a joke that has never come up at all', async () => {
      const overview = await overviewOf([episode(1)], [GUARDACHUVA, FEIJAO], [])
      expect(overview.topics.map((t) => [t.topicName, t.total])).toEqual([
        ['Feijão', 0],
        ['Guardachuva', 0],
      ])
    })

    it('ranks the jokes by how often they came up', async () => {
      const overview = await overviewOf([episode(1), episode(2)], [FEIJAO, GUARDACHUVA], tallies)
      expect(overview.topics.map((t) => t.topicName)).toEqual(['Guardachuva', 'Feijão'])
    })

    it('reads episodes in order so a trend means something', async () => {
      const overview = await overviewOf([episode(2), episode(1)], [GUARDACHUVA], tallies)
      expect(overview.topics[0]?.perEpisode.map((p) => p.episodeNumber)).toEqual([1, 2])
    })

    it.each([
      ['rising', [4, 9], 'up'],
      ['falling', [9, 4], 'down'],
      ['unchanged', [5, 5], 'flat'],
    ])('calls a %s joke %s', async (_name, counts, expected) => {
      const episodes = counts.map((_, i) => episode(i + 1))
      const tally = counts.map((count, i) => ({
        episodeId: `ep-${i + 1}`,
        topicId: 't-guardachuva',
        count,
      }))
      const overview = await overviewOf(episodes, [GUARDACHUVA], tally)
      expect(overview.topics[0]?.trend).toBe(expected)
    })

    it('will not call a trend on a single episode', async () => {
      const overview = await overviewOf([episode(1)], [GUARDACHUVA], [
        { episodeId: 'ep-1', topicId: 't-guardachuva', count: 4 },
      ])
      expect(overview.topics[0]?.trend).toBe('unknown')
    })

    it('ignores a tally for an episode that is not in the series', async () => {
      const overview = await overviewOf([episode(1)], [GUARDACHUVA], [
        { episodeId: 'ep-1', topicId: 't-guardachuva', count: 4 },
        { episodeId: 'ep-999', topicId: 't-guardachuva', count: 1_000 },
      ])
      expect(overview.topics[0]?.total).toBe(4)
    })

    it('ignores a tally for a joke nobody is tracking', async () => {
      const overview = await overviewOf([episode(1)], [GUARDACHUVA], [
        { episodeId: 'ep-1', topicId: 't-deleted', count: 50 },
      ])
      expect(overview.topics).toHaveLength(1)
      expect(overview.topics[0]?.total).toBe(0)
    })
  })

  it('is deterministic', async () => {
    const args = [[episode(1), episode(2)], [GUARDACHUVA, FEIJAO], [
      { episodeId: 'ep-1', topicId: 't-guardachuva', count: 4 },
    ]] as const
    const once = await overviewOf(...args)
    expect(JSON.stringify(await overviewOf(...args))).toBe(JSON.stringify(once))
  })
})

describe('the words said most across the series', () => {
  it('passes them through, biggest first as the database ordered them', async () => {
    const overview = await overviewOf(
      [episode(1)],
      [],
      [],
      [term('cara', 4208, 23), term('falar', 1686, 23)],
    )

    expect(overview.topTerms.map((t) => [t.term, t.total])).toEqual([
      ['cara', 4208],
      ['falar', 1686],
    ])
  })

  /*
   * Asked for at the top rather than sliced here. The database can order and
   * cut in one pass over an index; slicing in memory means moving every term
   * of every episode — a hundred and eighty thousand rows at a hundred
   * episodes — in order to return twenty-five.
   */
  it('asks the database for exactly the number it will show', async () => {
    askedFor = undefined
    await overviewOf([episode(1)])

    expect(askedFor).toBe(TOP_TERMS)
  })

  /*
   * A word in one episode is not a habit, and the column that says so has to
   * survive to the page. Without it a total of four thousand reads the same
   * whether it was said across the whole series or once in one conversation.
   */
  it('keeps how many episodes each word appears in', async () => {
    const overview = await overviewOf([episode(1)], [], [], [term('cara', 4208, 23)])

    expect(overview.topTerms[0]?.episodes).toBe(23)
  })

  it('has nothing to show for a series with no episodes', async () => {
    expect((await overviewOf([])).topTerms).toEqual([])
  })
})
