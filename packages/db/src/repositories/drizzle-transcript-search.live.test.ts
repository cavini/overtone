// US-047
//
// Search against real Postgres. Nothing else can tell you whether the
// stemmer is doing its job, or whether the expression index is actually
// being used rather than quietly bypassed.
//
// Skipped without DATABASE_URL, because CI has no database.
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { searchTranscripts } from '@overtone/core'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { episodes, segments, series, seriesMembers, transcripts } from '../schema.js'
import { DrizzleTranscriptSearch } from './drizzle-transcript-search.js'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const url = process.env['DATABASE_URL']

/** An owner id no real account can have, so the cleanup cannot reach real rows. */
const OWNER = '00000000-0000-0000-0000-000000005ea4'

/*
 * What this test searches.
 *
 * Seeded rather than assumed. These assertions used to run against whatever
 * happened to be in the shared database, and they passed for a year because
 * an old episode of the show said "cachorro" in it. Deleting that episode
 * turned them red without a line of code changing — a test that reports on
 * the contents of a database rather than on the behaviour it is named for.
 *
 * The first three are within the ninety seconds that collapse into one
 * moment; the fourth is ten minutes out, so it is a second one.
 */
const SPOKEN = [
  { startMs: 0, endMs: 4_000, text: 'O cachorro do Dex latiu a noite inteira.' },
  { startMs: 10_000, endMs: 14_000, text: 'Eu falei desse cachorro semana passada.' },
  { startMs: 20_000, endMs: 24_000, text: 'Ele falou que ia trazer o cachorro.' },
  { startMs: 600_000, endMs: 604_000, text: 'Estávamos falando do cachorro de novo.' },
  { startMs: 620_000, endMs: 624_000, text: 'Eles falaram muito do assunto.' },
] as const

if (url === undefined || url.length === 0) {
  describe('DrizzleTranscriptSearch', () => {
    it.skip('needs DATABASE_URL', () => {})
  })
} else {
  const client = postgres(url, { prepare: false, max: 2, onnotice: () => {} })
  const db = drizzle(client)
  const search = new DrizzleTranscriptSearch(db)

  describe('DrizzleTranscriptSearch against real postgres', () => {
    let episodeId = ''

    /** Only what this test seeded. The database is shared with real episodes. */
    const mine = <T extends { readonly episodeId: string }>(found: readonly T[]): T[] =>
      found.filter((match) => match.episodeId === episodeId)

    beforeAll(async () => {
      await db.delete(series).where(eq(series.ownerId, OWNER))

      const [created] = await db
        .insert(series)
        .values({ ownerId: OWNER, title: 'Search' })
        .returning({ id: series.id })
      const seriesId = created?.id ?? ''
      await db.insert(seriesMembers).values({ seriesId, userId: OWNER, role: 'owner' })

      const [episode] = await db
        .insert(episodes)
        // Search deliberately ignores anything still being processed, so a
        // half-transcribed episode cannot answer a question about the show.
        .values({ seriesId, number: 1, title: 'Seeded', status: 'ready' })
        .returning({ id: episodes.id })
      episodeId = episode?.id ?? ''

      const [transcript] = await db
        .insert(transcripts)
        .values({
          episodeId,
          provider: 'fake',
          providerModel: 'seed',
          rawProviderPayload: [],
          fullText: SPOKEN.map((line) => line.text).join(' '),
        })
        .returning({ id: transcripts.id })

      await db.insert(segments).values(
        SPOKEN.map((line, position) => ({
          transcriptId: transcript?.id ?? '',
          position,
          startMs: line.startMs,
          endMs: line.endMs,
          text: line.text,
          words: [],
        })),
      )
    })

    afterAll(async () => {
      await db.delete(series).where(eq(series.ownerId, OWNER))
    })

    it('finds a word that was actually said', async () => {
      const found = mine(await search.search('cachorro', 300))

      expect(found).toHaveLength(4)
      expect(found[0]?.episodeNumber).toBeGreaterThan(0)
      expect(found[0]?.text.length).toBeGreaterThan(0)
    })

    /*
     * The reason for naming the language. Portuguese inflects heavily, and
     * a search that only matched the exact string typed would miss most of
     * what was said: `falar` is said as falei, falou, falando, falaram.
     */
    it('stems, so a search finds the other forms of the word', async () => {
      const infinitive = mine(await search.search('falar', 300))
      const surfaces = new Set(
        infinitive.flatMap((match) => match.text.toLowerCase().match(/fal\w+/gu) ?? []),
      )

      // Nobody said "falar". Every one of these is a different inflection.
      expect([...surfaces].sort()).toEqual(['falando', 'falaram', 'falei', 'falou'])
    })

    it('finds nothing for something nobody said', async () => {
      expect(await search.search('xilofonezinho', 20)).toEqual([])
    })

    // Someone will type one eventually, and `to_tsquery` would throw.
    it.each(['cachorro & gato', "o 'cachorro'", 'cachorro | <->'])(
      'survives query syntax typed by accident: %o',
      async (query) => {
        await expect(search.search(query, 10)).resolves.toBeInstanceOf(Array)
      },
    )

    it('respects the row limit', async () => {
      expect((await search.search('que', 5)).length).toBeLessThanOrEqual(5)
    })

    // End to end through the use case: scattered segments become the few
    // moments a person actually meant.
    it('collapses a conversation into one moment', async () => {
      const moments = mine(await searchTranscripts({ query: 'cachorro' }, { search }))

      // Four segments said it: three inside a minute and a half, one ten
      // minutes later. That is two moments, not four results.
      expect(moments).toHaveLength(2)
      expect(moments[0]).toMatchObject({ startMs: 0, hitCount: 3 })
      expect(moments[1]).toMatchObject({ startMs: 600_000, hitCount: 1 })
      for (const moment of moments) {
        expect(moment.endMs).toBeGreaterThanOrEqual(moment.startMs)
        expect(moment.quote.length).toBeGreaterThan(0)
      }
    })

    it('uses the index rather than reading every segment', async () => {
      const [plan] = await client`
        explain (format json)
        select s.id from segments s
        where to_tsvector('portuguese', s.text) @@ plainto_tsquery('portuguese', 'cachorro')`

      const text = JSON.stringify(plan)
      // A sequential scan here would still be correct, and would get slower
      // every week as the archive grows.
      expect(text).toContain('Bitmap Index Scan')
    })
  })
}
