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
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { describe, expect, it } from 'vitest'
import { DrizzleTranscriptSearch } from './drizzle-transcript-search.js'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const url = process.env['DATABASE_URL']

if (url === undefined || url.length === 0) {
  describe('DrizzleTranscriptSearch', () => {
    it.skip('needs DATABASE_URL', () => {})
  })
} else {
  const client = postgres(url, { prepare: false, max: 2, onnotice: () => {} })
  const search = new DrizzleTranscriptSearch(drizzle(client))

  describe('DrizzleTranscriptSearch against real postgres', () => {
    it('finds a word that was actually said', async () => {
      const found = await search.search('cachorro', 50)

      expect(found.length).toBeGreaterThan(0)
      expect(found[0]?.episodeNumber).toBeGreaterThan(0)
      expect(found[0]?.text.length).toBeGreaterThan(0)
    })

    /*
     * The reason for naming the language. Portuguese inflects heavily, and
     * a search that only matched the exact string typed would miss most of
     * what was said: `falar` is said as falei, falou, falando, falaram.
     */
    it('stems, so a search finds the other forms of the word', async () => {
      const infinitive = await search.search('falar', 200)
      const surfaces = new Set(
        infinitive.flatMap((match) => match.text.toLowerCase().match(/fal\w+/gu) ?? []),
      )

      expect(surfaces.size).toBeGreaterThan(1)
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
      const moments = await searchTranscripts({ query: 'cachorro' }, { search })

      expect(moments.length).toBeGreaterThan(0)
      expect(moments.length).toBeLessThan((await search.search('cachorro', 300)).length + 1)
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
