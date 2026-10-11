// US-002 · each friend sees only their own episodes
//
// M1's exit criterion (5): "a cross-account read test fails closed".
// Skipped without DATABASE_URL, because CI has no database.
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { searchTranscripts } from '@overtone/core'
import { DrizzleTranscriptSearch } from '@overtone/db/repositories'
import { episodes, segments, series, seriesMembers, transcripts } from '@overtone/db/schema'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  deleteEpisode,
  listEpisodes,
  mustOwnEpisode,
  pendingEpisode,
  seriesFor,
} from './analyse-upload.js'
import { seriesOverview } from './series.js'
import { createTopic, deleteTopic, listTopics } from './topics.js'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const url = process.env['DATABASE_URL']

if (url === undefined || url.length === 0) {
  describe('one library per person', () => {
    it.skip('needs DATABASE_URL', () => {})
  })
} else {
  /** Two people who are not each other, under ids no real account can have. */
  const MINE = '00000000-0000-0000-0000-0000000015a1'
  const THEIRS = '00000000-0000-0000-0000-0000000015a2'

  const client = postgres(url, { prepare: false, max: 3, onnotice: () => {} })
  const db = drizzle(client)

  let myEpisode = ''
  let theirEpisode = ''
  let theirTopic = ''

  /** A library with one finished episode and one line of transcript in it. */
  const furnish = async (owner: string, word: string): Promise<string> => {
    const seriesId = await seriesFor(owner)

    const [episode] = await db
      .insert(episodes)
      .values({
        seriesId,
        number: 1,
        title: `${word} episode`,
        status: 'ready',
        durationMs: 60_000,
      })
      .returning({ id: episodes.id })
    const episodeId = episode?.id ?? ''

    const [transcript] = await db
      .insert(transcripts)
      .values({
        episodeId,
        provider: 'fake',
        providerModel: 'seed',
        rawProviderPayload: [],
        fullText: `nós falamos de ${word} o tempo todo`,
      })
      .returning({ id: transcripts.id })

    await db.insert(segments).values({
      transcriptId: transcript?.id ?? '',
      position: 0,
      startMs: 0,
      endMs: 4_000,
      text: `nós falamos de ${word} o tempo todo`,
      words: [],
    })

    return episodeId
  }

  const clearUp = async () => {
    for (const owner of [MINE, THEIRS]) {
      await db.delete(seriesMembers).where(eq(seriesMembers.userId, owner))
      await db.delete(series).where(eq(series.ownerId, owner))
    }
  }

  beforeAll(async () => {
    await clearUp()
    // Distinct words, so a leak is unmistakable rather than a coincidence.
    myEpisode = await furnish(MINE, 'jabuticaba')
    theirEpisode = await furnish(THEIRS, 'quiabo')

    const made = await createTopic(THEIRS, { name: 'Quiabo', patterns: ['quiabo'] })
    theirTopic = 'topic' in made ? made.topic.id : ''
  })

  afterAll(async () => {
    await clearUp()
    await client.end()
  })

  describe('reading', () => {
    it('lists only my own episodes', async () => {
      const mine = await listEpisodes(MINE)

      expect(mine.map((episode) => episode.episodeId)).toEqual([myEpisode])
      expect(JSON.stringify(mine)).not.toContain('quiabo')
    })

    it('offers only my own episode to read', async () => {
      expect((await pendingEpisode(MINE))?.episodeId).not.toBe(theirEpisode)
    })

    it('counts only my own episodes in the series', async () => {
      const overview = await seriesOverview(MINE)

      expect(overview.episodes.map((episode) => episode.id)).toEqual([myEpisode])
      expect(overview.topics).toEqual([])
    })

    /*
     * Search reads every stored segment there is, so it is the one place an
     * unscoped query leaks the *contents* of another library rather than
     * just its titles.
     */
    it('never finds a word from somebody else’s transcript', async () => {
      const search = new DrizzleTranscriptSearch(db)

      const mine = await searchTranscripts(
        { seriesId: await seriesFor(MINE), query: 'quiabo' },
        { search },
      )

      expect(mine).toEqual([])
    })

    it('still finds a word from my own', async () => {
      const search = new DrizzleTranscriptSearch(db)

      const mine = await searchTranscripts(
        { seriesId: await seriesFor(MINE), query: 'jabuticaba' },
        { search },
      )

      expect(mine.length).toBeGreaterThan(0)
    })

    it('lists only my own running jokes', async () => {
      expect(await listTopics(MINE)).toEqual([])
      expect((await listTopics(THEIRS)).map((topic) => topic.name)).toEqual(['Quiabo'])
    })
  })

  describe('writing', () => {
    // A UUID in a URL is not a permission.
    it('refuses to reach somebody else’s episode by its id', async () => {
      await expect(mustOwnEpisode(MINE, theirEpisode)).rejects.toThrow()
    })

    it('allows my own', async () => {
      await expect(mustOwnEpisode(MINE, myEpisode)).resolves.toBeUndefined()
    })

    it('refuses to delete somebody else’s episode, and leaves it there', async () => {
      await expect(deleteEpisode(MINE, theirEpisode)).rejects.toThrow()

      expect((await listEpisodes(THEIRS)).map((episode) => episode.episodeId)).toEqual([
        theirEpisode,
      ])
    })

    it('refuses to delete somebody else’s running joke, and leaves it there', async () => {
      await expect(deleteTopic(MINE, theirTopic)).rejects.toThrow()

      expect((await listTopics(THEIRS)).map((topic) => topic.name)).toEqual(['Quiabo'])
    })
  })
}
