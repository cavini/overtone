// US-013 · find where something was said, across the whole series
//
// The budget that bounds the work used to be spent busiest-episode-first.
// Measured on a real library of fifteen episodes: "cara" matched 2 567 lines,
// and the busiest episode alone had 321 of them — so all 300 rows went to
// that one episode and the other fourteen were never looked at. The answer
// read as "you only said this in episode 13".
//
// Skipped without DATABASE_URL, because CI has none.
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { eq } from 'drizzle-orm'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DrizzleTranscriptSearch } from './drizzle-transcript-search.js'
import { episodes, segments, series, seriesMembers, transcripts } from '../schema.js'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const url = process.env['DATABASE_URL']

if (url === undefined || url.length === 0) {
  describe('search across the library', () => {
    it.skip('needs DATABASE_URL', () => {})
  })
} else {
  const client = postgres(url, { prepare: false, max: 2, onnotice: () => {} })
  const db = drizzle(client)
  const search = new DrizzleTranscriptSearch(db)

  /** An owner id no real account can have, so cleanup cannot reach real rows. */
  const OWNER = '00000000-0000-0000-0000-00000000se01'.replace('se', '5e')
  let seriesId = ''

  /*
   * One loud episode and four quiet ones, which is the shape that broke it:
   * the loud one on its own exceeds any sensible per-episode budget.
   */
  const LOUD_LINES = 40
  const QUIET_LINES = 3
  /** The loud episode's lines are spread over an hour, like a real one. */
  const LOUD_SPACING_MS = 90_000

  beforeAll(async () => {
    const [made] = await db
      .insert(series)
      .values({ ownerId: OWNER, title: 'Spanning' })
      .returning({ id: series.id })
    seriesId = made?.id ?? ''
    await db.insert(seriesMembers).values({ seriesId, userId: OWNER, role: 'owner' })

    for (let number = 1; number <= 5; number += 1) {
      const [episode] = await db
        .insert(episodes)
        .values({ seriesId, number, title: `Spanning #${String(number)}`, status: 'ready', durationMs: 600_000 })
        .returning({ id: episodes.id })
      const [transcript] = await db
        .insert(transcripts)
        .values({
          episodeId: episode?.id ?? '',
          provider: 'fake',
          providerModel: 'fake-1',
          rawProviderPayload: {},
          fullText: 'guardachuva',
        })
        .returning({ id: transcripts.id })

      const lines = number === 1 ? LOUD_LINES : QUIET_LINES
      // Spread across the episode for the loud one, so a cap that only ever
      // takes the earliest hits is visible.
      const spacing = number === 1 ? LOUD_SPACING_MS : 1_000
      await db.insert(segments).values(
        Array.from({ length: lines }, (_, at) => ({
          transcriptId: transcript?.id ?? '',
          position: at,
          startMs: at * spacing,
          endMs: at * spacing + 500,
          text: 'falamos do guardachuva de novo',
        })),
      )
    }
  })

  afterAll(async () => {
    if (seriesId.length > 0) await db.delete(series).where(eq(series.id, seriesId))
    await client.end()
  })

  describe('search across the library', () => {
    /*
     * The regression. With a flat budget of 10 the loud episode's 40 lines
     * would take every row and the four quiet episodes would be invisible.
     */
    it('returns something from every episode that matched', async () => {
      const found = await search.search(seriesId, 'guardachuva', 10)

      expect(new Set(found.map((row) => row.episodeNumber))).toEqual(new Set([1, 2, 3, 4, 5]))
    })

    // Still bounded: that was the point of having a budget at all.
    it('takes no more than the budget from any one episode', async () => {
      const found = await search.search(seriesId, 'guardachuva', 10)
      const perEpisode = new Map<number, number>()
      for (const row of found) {
        perEpisode.set(row.episodeNumber, (perEpisode.get(row.episodeNumber) ?? 0) + 1)
      }

      for (const [, taken] of perEpisode) expect(taken).toBeLessThanOrEqual(10)
    })

    // A quiet episode is not padded out to the budget, and not truncated.
    it('takes all of a quiet episode', async () => {
      const found = await search.search(seriesId, 'guardachuva', 10)

      expect(found.filter((row) => row.episodeNumber === 2)).toHaveLength(QUIET_LINES)
    })

    /*
     * The bug the first version of this cap had. Taking the earliest N lines
     * of each episode means a word said throughout only ever shows the
     * opening: measured on the real library, every moment for a word said
     * 2,500 times landed in the first 13 minutes of episodes running 35 to 90
     * minutes. The other 80% of each episode was invisible, and the answer
     * looked complete.
     */
    it('covers the whole episode, not just its opening', async () => {
      const found = await search.search(seriesId, 'guardachuva', 10)
      const loud = found.filter((row) => row.episodeNumber === 1)

      const lastLine = (LOUD_LINES - 1) * LOUD_SPACING_MS
      const latest = Math.max(...loud.map((row) => row.startMs))

      // Something from the back half of the episode, not just the front.
      expect(latest).toBeGreaterThan(lastLine / 2)
    })

    it('reads in order within an episode', async () => {
      const found = await search.search(seriesId, 'guardachuva', 10)
      const loud = found.filter((row) => row.episodeNumber === 1).map((row) => row.startMs)

      expect([...loud].sort((a, b) => a - b)).toEqual(loud)
    })
  })
}
