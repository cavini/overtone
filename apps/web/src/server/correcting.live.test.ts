// US-049 · fixing a line the transcriber got wrong
//
// The point of the feature is not the typing. It is that everything made
// from the words is made again: a correction that only changed the text on
// screen would leave the counts describing words nobody said, and the counts
// are the entire product.
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  chunkTranscripts,
  episodeCorrections,
  episodes,
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
import { seriesFor } from './analyse-upload.js'
import { correctLine } from './corrections.js'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const url = process.env['DATABASE_URL']

/*
 * Storage as well as a database, which is not obvious from here: a
 * correction re-derives the episode through `advanceOnce`, and that sweeps
 * the chunk audio on its way out. So `blobStore()` is reached two calls
 * down and throws without a key.
 *
 * Named rather than left to fail, now that CI has a database and no bucket.
 */
const bucket = process.env['SUPABASE_SECRET_KEY']

if (url === undefined || url.length === 0 || bucket === undefined || bucket.length === 0) {
  describe('correcting a line', () => {
    it.skip('needs DATABASE_URL and SUPABASE_SECRET_KEY', () => {})
  })
} else {
  const MINE = '00000000-0000-0000-0000-00000000c044'

  const client = postgres(url, { prepare: false, max: 3, onnotice: () => {} })
  const db = drizzle(client)

  let episodeId = ''

  const clearUp = async (): Promise<void> => {
    await db.delete(seriesMembers).where(eq(seriesMembers.userId, MINE))
    await db.delete(series).where(eq(series.ownerId, MINE))
  }

  const countOf = async (lemma: string): Promise<number> => {
    const counted = await db
      .select({ lemma: termCounts.lemma, count: termCounts.count })
      .from(termCounts)
      .where(eq(termCounts.episodeId, episodeId))

    return counted.find((row) => row.lemma === lemma)?.count ?? 0
  }

  /** One chunk, one sentence, with the word the transcriber got wrong in it. */
  beforeAll(async () => {
    await clearUp()
    const seriesId = await seriesFor(MINE)

    const [episode] = await db
      .insert(episodes)
      .values({ seriesId, number: 1, title: 'Correction', status: 'ready', durationMs: 4_000 })
      .returning({ id: episodes.id })
    episodeId = episode?.id ?? ''

    await db.insert(chunkTranscripts).values({
      episodeId,
      index: 0,
      offsetMs: 0,
      words: [
        { text: 'tô', startMs: 0, endMs: 300 },
        { text: 'mostrando', startMs: 400, endMs: 900 },
        { text: 'a', startMs: 1_000, endMs: 1_100 },
        { text: 'saia', startMs: 1_200, endMs: 1_600 },
        { text: 'agora.', startMs: 1_700, endMs: 2_100 },
      ],
    })
  }, 60_000)

  afterAll(async () => {
    await clearUp()
    await client.end()
  })

  describe('correcting a line', () => {
    /*
     * `mostrar` and `casa`, not `saia` and `sair`.
     *
     * Picking the words to assert on took three goes, and the lemmatiser
     * was right every time:
     *
     * - `saia` is counted under **sair** — it is the subjunctive of the
     *   verb. Worse, the corrected line contains *sair* as well, so it was
     *   the one word in the sentence that could not tell the two readings
     *   apart.
     * - `casa` is counted under **casar**. A genuine ambiguity in
     *   Portuguese rather than a mistake: *casa* really is a form of *to
     *   marry* as well as being a house.
     *
     * So: `mostrar`, which is only in what was heard, and `começar`, which
     * is only in what was said.
     */
    it('counted what the transcriber heard, to begin with', async () => {
      // A no-op correction, only to make the episode analyse once.
      await correctLine(MINE, episodeId, 0, 1, '')

      expect(await countOf('mostrar')).toBe(1)
      expect(await countOf('começar')).toBe(0)
    }, 60_000)

    /*
     * The whole feature in one assertion: the word that was never said stops
     * being counted, and the one that was starts.
     */
    it('moves the counts to what was actually said', async () => {
      await correctLine(MINE, episodeId, 0, 2_200, 'tô começando a sair de casa agora')

      expect(await countOf('mostrar'), 'the mis-heard word is still counted').toBe(0)
      expect(await countOf('começar'), 'the word actually said is not counted').toBe(1)
    }, 60_000)

    it('rewrites the transcript the reader and the search see', async () => {
      const [stored] = await db
        .select({ fullText: transcripts.fullText })
        .from(transcripts)
        .where(eq(transcripts.episodeId, episodeId))

      expect(stored?.fullText).toContain('casa')
      expect(stored?.fullText).not.toContain('mostrando')

      const lines = await db
        .select({ text: segments.text })
        .from(segments)
        .innerJoin(transcripts, eq(transcripts.id, segments.transcriptId))
        .where(eq(transcripts.episodeId, episodeId))

      expect(lines.map((line) => line.text).join(' ')).toContain('casa')
    }, 60_000)

    /*
     * The audio is untouched, and so is what Whisper said. A correction is an
     * overlay — which is what makes it reversible, and what keeps the
     * original available to compare against.
     */
    it('leaves what the transcriber actually said where it was', async () => {
      const [chunk] = await db
        .select({ words: chunkTranscripts.words })
        .from(chunkTranscripts)
        .where(eq(chunkTranscripts.episodeId, episodeId))

      // The column is typed loosely at the edge; what matters here is only
      // that the original wording survived the correction.
      const said = JSON.stringify(chunk?.words ?? [])
      expect(said).toContain('mostrando')
      expect(said).toContain('saia')
    }, 60_000)

    it('puts the counts back when the correction is taken away', async () => {
      await correctLine(MINE, episodeId, 0, 2_200, '')

      expect(await db.select().from(episodeCorrections).where(eq(episodeCorrections.episodeId, episodeId)))
        .toEqual([])
      expect(await countOf('mostrar')).toBe(1)
      expect(await countOf('começar')).toBe(0)
    }, 60_000)
  })
}
