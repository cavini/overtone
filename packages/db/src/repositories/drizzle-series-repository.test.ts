// US-032, US-038, US-042 · ADR 0012
//
// Tested through Drizzle's proxy driver, which hands over the SQL and its
// parameters instead of running them. That makes the security-critical part
// assertable without a database: a repository that forgets to scope a read by
// membership leaks another group's episodes, and it leaks them silently.
import { drizzle } from 'drizzle-orm/pg-proxy'
import { beforeEach, describe, expect, it } from 'vitest'
import { DrizzleSeriesRepository } from './drizzle-series-repository.js'

const SERIES = '11111111-1111-1111-1111-111111111111'
const USER = '22222222-2222-2222-2222-222222222222'

interface Captured {
  readonly sql: string
  readonly params: unknown[]
}

let captured: Captured[]
let repository: DrizzleSeriesRepository

const rowsFor = (sql: string): Record<string, unknown>[] => {
  if (sql.includes('"topics"')) {
    return [{ id: 't-1', name: 'Hotdog', patterns: ['hotdog', 'hot dog'] }]
  }
  if (sql.includes('"mentions"')) {
    return [{ episode_id: 'ep-1', topic_id: 't-1', count: '4' }]
  }
  return [
    {
      id: 'ep-1',
      number: 1,
      title: 'Episódio 1',
      recorded_on: '2026-10-01',
      status: 'ready',
      duration_ms: 6_000_000,
      word_tokens: 10_000,
      unique_terms: 1_500,
    },
  ]
}

beforeEach(() => {
  captured = []
  const db = drizzle(async (sql, params) => {
    captured.push({ sql, params })
    return { rows: rowsFor(sql).map((row) => Object.values(row)) }
  })
  repository = new DrizzleSeriesRepository(db, USER)
})

const onlyQuery = () => captured[0]?.sql ?? ''

describe('DrizzleSeriesRepository', () => {
  describe('scoping every read by membership', () => {
    // The whole point of ADR 0012. Not ownership — membership — so inviting a
    // co-host stays a row insert instead of a migration touching every query.
    it.each([
      ['episodes', () => repository.episodes(SERIES)],
      ['topics', () => repository.topics(SERIES)],
      ['topicTallies', () => repository.topicTallies(SERIES)],
    ])('checks membership before returning %s', async (_name, read) => {
      await read()
      expect(onlyQuery()).toContain('series_members')
      expect(captured[0]?.params).toContain(USER)
    })

    it.each([
      ['episodes', () => repository.episodes(SERIES)],
      ['topics', () => repository.topics(SERIES)],
      ['topicTallies', () => repository.topicTallies(SERIES)],
    ])('never scopes %s by ownership instead', async (_name, read) => {
      await read()
      // `owner_id` would work today, while one person has one series, and
      // break the moment a second host is invited.
      expect(onlyQuery()).not.toContain('owner_id')
    })

    it('always asks about the series it was given', async () => {
      await repository.episodes(SERIES)
      expect(captured[0]?.params).toContain(SERIES)
    })
  })

  describe('episodes', () => {
    it('reads the fields a summary needs', async () => {
      const episodes = await repository.episodes(SERIES)
      expect(episodes[0]).toEqual({
        id: 'ep-1',
        number: 1,
        title: 'Episódio 1',
        recordedOn: '2026-10-01',
        status: 'ready',
        durationMs: 6_000_000,
        wordTokens: 10_000,
        uniqueTerms: 1_500,
      })
    })

    // An episode with no insight row yet is still an episode — it is mid
    // pipeline, and the library has to list it.
    it('joins the totals loosely so an unanalysed episode still appears', async () => {
      await repository.episodes(SERIES)
      expect(onlyQuery()).toMatch(/left join/i)
      expect(onlyQuery()).toContain('"insights"')
    })

    it('orders by episode number so the series reads in sequence', async () => {
      await repository.episodes(SERIES)
      expect(onlyQuery()).toMatch(/order by[\s\S]*"number"/i)
    })
  })

  describe('topicTallies', () => {
    // Counting rows in `mentions` per episode and topic, rather than
    // re-scanning transcripts. This is the aggregate the series view reads and
    // the assistant will later query.
    it('aggregates mentions rather than re-reading transcripts', async () => {
      await repository.topicTallies(SERIES)
      expect(onlyQuery()).toContain('"mentions"')
      expect(onlyQuery()).toMatch(/count\(/i)
      expect(onlyQuery()).toMatch(/group by/i)
      expect(onlyQuery()).not.toContain('"segments"')
      expect(onlyQuery()).not.toContain('"transcripts"')
    })

    it('returns counts as numbers, not as the strings postgres sends', async () => {
      const tallies = await repository.topicTallies(SERIES)
      expect(tallies[0]).toEqual({ episodeId: 'ep-1', topicId: 't-1', count: 4 })
      expect(typeof tallies[0]?.count).toBe('number')
    })
  })

  describe('topics', () => {
    it('brings each topic its spellings', async () => {
      const topics = await repository.topics(SERIES)
      expect(topics[0]).toEqual({
        id: 't-1',
        name: 'Hotdog',
        patterns: ['hotdog', 'hot dog'],
      })
    })

    it('gathers the spellings in the database rather than in a second query', async () => {
      await repository.topics(SERIES)
      expect(captured).toHaveLength(1)
      expect(onlyQuery()).toContain('topic_terms')
    })
  })

  it('makes exactly one query per read', async () => {
    await repository.episodes(SERIES)
    expect(captured).toHaveLength(1)
  })
})
