// US-025 · "Deletion names what it destroys, then destroys it"
//
// *As any user, I want deletion to be real, so that I trust the app with
// recordings of my friends.*
//
// The only test deleteEpisode had was that it refuses somebody else's. That
// deletion actually removes anything was asserted nowhere — the whole
// promise rested on five foreign keys being declared the way everybody
// assumed, and on the audio being swept by hand in the same function.
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  chunkTranscripts,
  episodes,
  insights,
  segments,
  series,
  seriesMembers,
  termCounts,
  transcripts,
} from '@overtone/db/schema'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteEpisode, seriesFor } from './analyse-upload.js'
import { blobStore } from './wiring.js'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const url = process.env['DATABASE_URL']

if (url === undefined || url.length === 0) {
  describe('deletion', () => {
    it.skip('needs DATABASE_URL', () => {})
  })
} else {
  /** An owner id no real account can have. */
  const MINE = '00000000-0000-0000-0000-00000000de1e'

  const client = postgres(url, { prepare: false, max: 3, onnotice: () => {} })
  const db = drizzle(client)

  let episodeId = ''
  let transcriptId = ''

  const clearUp = async (): Promise<void> => {
    await db.delete(seriesMembers).where(eq(seriesMembers.userId, MINE))
    await db.delete(series).where(eq(series.ownerId, MINE))
  }

  /** An episode with something in every table that hangs off it. */
  beforeAll(async () => {
    await clearUp()
    const seriesId = await seriesFor(MINE)

    const [episode] = await db
      .insert(episodes)
      .values({
        seriesId,
        number: 1,
        title: 'Something said in confidence',
        status: 'ready',
        durationMs: 600_000,
      })
      .returning({ id: episodes.id })
    episodeId = episode?.id ?? ''

    const [transcript] = await db
      .insert(transcripts)
      .values({
        episodeId,
        provider: 'fake',
        providerModel: 'seed',
        rawProviderPayload: [{ text: 'a thing nobody else should read' }],
        fullText: 'a thing nobody else should read',
      })
      .returning({ id: transcripts.id })
    transcriptId = transcript?.id ?? ''

    await db.insert(segments).values({
      transcriptId,
      position: 0,
      startMs: 0,
      endMs: 4_000,
      text: 'a thing nobody else should read',
      words: [],
    })
    await db.insert(chunkTranscripts).values({ episodeId, index: 0, offsetMs: 0, words: [] })
    await db.insert(termCounts).values({ episodeId, lemma: 'confidência', surfaceForms: [], count: 1 })
    await db.insert(insights).values({
      episodeId,
      pipelineVersion: 5,
      totalTokens: 6,
      wordTokens: 6,
      stopWordTokens: 0,
      fillerTokens: 0,
      uniqueTerms: 6,
      wordsPerMinute: 1,
      fillersPerMinute: 0,
    })

    /*
     * The audio too. This is the one part of deletion that is not a foreign
     * key: `deleteEpisode` works out the chunk keys itself and asks storage
     * to remove them, so it is the half that can silently stop matching
     * what was actually uploaded.
     */
    await blobStore().put(
      `episodes/${episodeId}/chunk-0.wav`,
      new Uint8Array([0x52, 0x49, 0x46, 0x46]),
      'audio/wav',
    )
  })

  afterAll(async () => {
    await clearUp()
    await client.end()
  })

  describe('deleting an episode', () => {
    it('had something in every table to begin with', async () => {
      // Otherwise the assertions below pass against an episode that was
      // already empty, which is how a deletion test says nothing.
      expect(await db.select().from(transcripts).where(eq(transcripts.episodeId, episodeId)))
        .toHaveLength(1)
      expect(await db.select().from(segments).where(eq(segments.transcriptId, transcriptId)))
        .toHaveLength(1)
      expect(await blobStore().list(`episodes/${episodeId}`)).toHaveLength(1)
    })

    it('leaves nothing behind in any table', async () => {
      await deleteEpisode(MINE, episodeId)

      expect(await db.select().from(episodes).where(eq(episodes.id, episodeId))).toEqual([])
      expect(await db.select().from(transcripts).where(eq(transcripts.episodeId, episodeId)))
        .toEqual([])
      expect(await db.select().from(chunkTranscripts).where(eq(chunkTranscripts.episodeId, episodeId)))
        .toEqual([])
      expect(await db.select().from(termCounts).where(eq(termCounts.episodeId, episodeId)))
        .toEqual([])
      expect(await db.select().from(insights).where(eq(insights.episodeId, episodeId))).toEqual([])
    })

    /*
     * Segments hang off the transcript rather than the episode, so they are
     * two cascades deep. A missing rule there leaves the actual words of
     * the conversation in the database after the episode is gone.
     */
    it('takes the segments with it, two cascades down', async () => {
      expect(await db.select().from(segments).where(eq(segments.transcriptId, transcriptId)))
        .toEqual([])
    })

    /*
     * The recording itself, which is the thing the story is actually about.
     * Rows can be rebuilt; the audio is what was said in somebody's living
     * room, and it is the one part removed by hand rather than by cascade.
     */
    it('takes the audio with it', async () => {
      expect(await blobStore().list(`episodes/${episodeId}`)).toEqual([])
    })
  })
}
