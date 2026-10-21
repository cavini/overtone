// US-038 · a failed episode can be put back in the queue
//
// Episode 41 gave up on one bad response from the transcriber and sat at 1/9
// for two days with all its remaining audio in the bucket. Nothing in the
// product could have restarted it: `advancePending` selects only the
// in-flight statuses, `pendingEpisode` follows only `transcribing`, and
// re-uploading the file is refused as a duplicate by its audio digest. It
// took somebody with database access.
//
// Live rather than unit, because what is being asserted is the write: that
// the status and the failure columns end up in the one state the scheduler
// will pick up again.
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { episodes, series, seriesMembers } from '@overtone/db/schema'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { NotYours, retryEpisode, seriesFor } from './analyse-upload.js'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const url = process.env['DATABASE_URL']

if (url === undefined || url.length === 0) {
  describe('retrying', () => {
    it.skip('needs DATABASE_URL', () => {})
  })
} else {
  /** Owner ids no real account can have. `fa11` for the thing that failed. */
  const MINE = '00000000-0000-0000-0000-0000000ffa11'
  const SOMEBODY_ELSE = '00000000-0000-0000-0000-0000000ffa12'

  const client = postgres(url, { prepare: false, max: 3, onnotice: () => {} })
  const db = drizzle(client)

  const clearUp = async (): Promise<void> => {
    for (const owner of [MINE, SOMEBODY_ELSE]) {
      await db.delete(seriesMembers).where(eq(seriesMembers.userId, owner))
      await db.delete(series).where(eq(series.ownerId, owner))
    }
  }

  /** One episode, failed the way episode 41 was. */
  const seed = async (
    owner: string,
    status: 'failed' | 'ready' = 'failed',
  ): Promise<string> => {
    const [episode] = await db
      .insert(episodes)
      .values({
        seriesId: await seriesFor(owner),
        number: 41,
        title: 'Sun Your Balls #041',
        status,
        durationMs: 5_006_352,
        ...(status === 'failed'
          ? { failureCode: 'AUDIO_NOT_FOUND', failureParams: {} }
          : {}),
      })
      .returning({ id: episodes.id })

    return episode?.id ?? ''
  }

  const read = async (id: string) => {
    const [row] = await db
      .select({
        status: episodes.status,
        failureCode: episodes.failureCode,
        failureParams: episodes.failureParams,
      })
      .from(episodes)
      .where(eq(episodes.id, id))

    return row
  }

  beforeEach(clearUp)
  afterAll(async () => {
    await clearUp()
    await client.end()
  })

  describe('retryEpisode', () => {
    it('puts a failed episode back in the queue', async () => {
      const id = await seed(MINE)

      expect(await retryEpisode(MINE, id)).toBe(true)
      expect(await read(id)).toMatchObject({ status: 'transcribing' })
    })

    /*
     * The code as well as the status. A row still carrying `AUDIO_NOT_FOUND`
     * reads as failed to the library however the status column looks, which
     * is the same wrong answer the spinner used to give pointing the other
     * way.
     */
    it('clears what the row said went wrong', async () => {
      const id = await seed(MINE)
      await retryEpisode(MINE, id)

      expect(await read(id)).toMatchObject({ failureCode: null, failureParams: null })
    })

    it('refuses an episode belonging to somebody else', async () => {
      const id = await seed(SOMEBODY_ELSE)

      await expect(retryEpisode(MINE, id)).rejects.toThrow(NotYours)
      // And left it alone.
      expect(await read(id)).toMatchObject({ status: 'failed' })
    })

    /*
     * Only a failed episode. A finished one would be re-derived, which is a
     * different thing with a different button, and an in-flight one is
     * already in the queue — putting it back would say something happened
     * when nothing did.
     */
    it('leaves an episode that has not failed alone', async () => {
      const id = await seed(MINE, 'ready')

      expect(await retryEpisode(MINE, id)).toBe(false)
      expect(await read(id)).toMatchObject({ status: 'ready' })
    })
  })
}
