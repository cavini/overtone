// US-014 · the words the series says most
//
// Against the real database, because the whole point of this query is that
// the database does the totalling — a fake that returns rows cannot show
// whether the SQL groups, orders or scopes correctly.
//
// Skipped without DATABASE_URL, because CI has none.
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { eq } from 'drizzle-orm'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DrizzleSeriesRepository } from './drizzle-series-repository.js'
import { episodes, series, seriesMembers, termCounts } from '../schema.js'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const url = process.env['DATABASE_URL']

if (url === undefined || url.length === 0) {
  describe('topTerms', () => {
    it.skip('needs DATABASE_URL', () => {})
  })
} else {
  const client = postgres(url, { prepare: false, max: 2, onnotice: () => {} })
  const db = drizzle(client)
  /*
   * Built with the owner, because every query here is scoped by membership —
   * `exists (select 1 from series_members where user_id = …)`. Constructing
   * it without one asks for a library belonging to nobody, which is the
   * right answer to the wrong question.
   */
  let repository: DrizzleSeriesRepository

  /** An owner id no real account can have, so cleanup cannot reach real rows. */
  const OWNER = '00000000-0000-0000-0000-00000000tt01'.replace('tt', 'cc')
  let seriesId = ''

  const anEpisode = async (number: number, status: 'ready' | 'transcribing') => {
    const [made] = await db
      .insert(episodes)
      .values({ seriesId, number, title: `Counted #${String(number)}`, status, durationMs: 60_000 })
      .returning({ id: episodes.id })
    return made?.id ?? ''
  }

  beforeAll(async () => {
    const [made] = await db
      .insert(series)
      .values({ ownerId: OWNER, title: 'Counted' })
      .returning({ id: series.id })
    seriesId = made?.id ?? ''
    await db.insert(seriesMembers).values({ seriesId, userId: OWNER, role: 'owner' })
    repository = new DrizzleSeriesRepository(db, OWNER)

    const first = await anEpisode(1, 'ready')
    const second = await anEpisode(2, 'ready')
    const unfinished = await anEpisode(3, 'transcribing')

    await db.insert(termCounts).values([
      // Said in both episodes, so it totals and counts two episodes.
      { episodeId: first, lemma: 'guardachuva', surfaceForms: ['guardachuva'], count: 10 },
      { episodeId: second, lemma: 'guardachuva', surfaceForms: ['guardachuvas'], count: 5 },
      // A bigger total, but from one episode only.
      { episodeId: first, lemma: 'feijao', surfaceForms: ['feijao'], count: 20 },
      // Stemmed in one episode and not the other.
      { episodeId: first, lemma: 'chuva', surfaceForms: ['chuva'], count: 3, heuristic: true },
      { episodeId: second, lemma: 'chuva', surfaceForms: ['chuvas'], count: 1 },
      // In an episode still transcribing, so its counts are partial.
      { episodeId: unfinished, lemma: 'guardachuva', surfaceForms: ['guardachuva'], count: 999 },
    ])
  })

  afterAll(async () => {
    if (seriesId.length > 0) await db.delete(series).where(eq(series.id, seriesId))
    await client.end()
  })

  describe('topTerms', () => {
    it('totals a word across the episodes it was said in', async () => {
      const found = await repository.topTerms(seriesId, 25)

      expect(found.find((t) => t.term === 'guardachuva')).toMatchObject({
        total: 15,
        episodes: 2,
      })
    })

    /*
     * An episode still transcribing has counts for whichever chunks happen
     * to have landed. Letting those into a series total makes the number
     * move for reasons nobody can see — so the 999 above must not appear.
     */
    it('counts only episodes that finished', async () => {
      const found = await repository.topTerms(seriesId, 25)

      expect(found.find((t) => t.term === 'guardachuva')?.total).toBe(15)
    })

    it('puts the biggest total first', async () => {
      const found = await repository.topTerms(seriesId, 25)

      expect(found.map((t) => t.term).slice(0, 2)).toEqual(['feijao', 'guardachuva'])
    })

    it('returns no more than it was asked for', async () => {
      expect(await repository.topTerms(seriesId, 2)).toHaveLength(2)
    })

    /*
     * Stemmed in one episode is stemmed: a total built partly on a guess
     * should not read as solidly as one that is not, and the page says so.
     */
    it('marks a word as heuristic if any episode guessed at it', async () => {
      const found = await repository.topTerms(seriesId, 25)

      expect(found.find((t) => t.term === 'chuva')?.heuristic).toBe(true)
      expect(found.find((t) => t.term === 'feijao')?.heuristic).toBe(false)
    })

    /*
     * Another group's words are not in this answer, whatever they said. Asked
     * as somebody who is not a member of this series rather than for a series
     * that does not exist — a missing series would answer empty for the wrong
     * reason and the test would pass with the membership check deleted.
     */
    it('sees nothing as somebody who is not a member', async () => {
      const stranger = new DrizzleSeriesRepository(db, '00000000-0000-4000-8000-000000000999')

      expect(await stranger.topTerms(seriesId, 25)).toEqual([])
    })
  })
}
