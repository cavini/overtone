// US-049 · a result can be shown to somebody without an account
//
// Skipped without DATABASE_URL, because CI has no database.
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { episodes, series, seriesMembers } from '@overtone/db/schema'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { shareEpisode, sharedEpisode, shareLinkFor, stopSharing } from './sharing.js'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const url = process.env['DATABASE_URL']

if (url === undefined || url.length === 0) {
  describe('sharing', () => {
    it.skip('needs DATABASE_URL', () => {})
  })
} else {
  /** Two people who are not each other, under ids no real account can have. */
  const MINE = '00000000-0000-0000-0000-00000000de01'
  const THEIRS = '00000000-0000-0000-0000-00000000de02'

  const client = postgres(url, { prepare: false, max: 2, onnotice: () => {} })
  const db = drizzle(client)

  let mine = ''
  let theirs = ''

  const makeLibrary = async (owner: string, title: string): Promise<string> => {
    const [made] = await db
      .insert(series)
      .values({ ownerId: owner, title })
      .returning({ id: series.id })
    const seriesId = made?.id ?? ''
    await db.insert(seriesMembers).values({ seriesId, userId: owner, role: 'owner' })

    const [episode] = await db
      .insert(episodes)
      .values({ seriesId, number: 1, title: `${title} ep`, status: 'ready', durationMs: 60_000 })
      .returning({ id: episodes.id })

    return episode?.id ?? ''
  }

  beforeAll(async () => {
    for (const owner of [MINE, THEIRS]) {
      await db.delete(series).where(eq(series.ownerId, owner))
    }
    mine = await makeLibrary(MINE, 'Mine')
    theirs = await makeLibrary(THEIRS, 'Theirs')
  })

  afterAll(async () => {
    for (const owner of [MINE, THEIRS]) {
      await db.delete(series).where(eq(series.ownerId, owner))
    }
    await client.end()
  })

  describe('sharing an episode', () => {
    it('hands back a link that opens without an account', async () => {
      const token = await shareEpisode(MINE, mine)

      const seen = await sharedEpisode(token)
      expect(seen?.title).toBe('Mine ep')
    })

    /*
     * **Counts and the quotes behind them, never the transcript** (Q17).
     *
     * It holds because of what the shared view *is* rather than what it
     * hides — the analysis has no transcript in it — so this asserts the
     * shape rather than trusting a filter somebody has to remember.
     */
    it('carries no transcript, and nothing about the library it came from', async () => {
      const token = await shareEpisode(MINE, mine)
      const seen = await sharedEpisode(token)

      const everything = JSON.stringify(seen)
      for (const forbidden of ['transcript', 'seriesId', 'ownerId', 'userId', 'email']) {
        expect(everything).not.toContain(forbidden)
      }
      expect(Object.keys(seen ?? {}).sort()).toEqual(['analysis', 'number', 'title'])
    })

    it('hands back the same link when asked twice', async () => {
      const first = await shareEpisode(MINE, mine)
      const second = await shareEpisode(MINE, mine)

      expect(second).toBe(first)
    })

    it('reports the link an episode already has', async () => {
      const token = await shareEpisode(MINE, mine)
      expect(await shareLinkFor(MINE, mine)).toBe(token)
    })
  })

  describe('revoking', () => {
    it('makes the link stop working', async () => {
      const token = await shareEpisode(MINE, mine)
      await stopSharing(MINE, mine)

      expect(await sharedEpisode(token)).toBeUndefined()
    })

    it('leaves nothing to report', async () => {
      await shareEpisode(MINE, mine)
      await stopSharing(MINE, mine)

      expect(await shareLinkFor(MINE, mine)).toBeUndefined()
    })
  })

  describe('whose episode it is', () => {
    it('refuses to share somebody else’s', async () => {
      await expect(shareEpisode(MINE, theirs)).rejects.toThrow()
    })

    it('refuses to revoke somebody else’s', async () => {
      await shareEpisode(THEIRS, theirs)
      await expect(stopSharing(MINE, theirs)).rejects.toThrow()

      // And it is still shared, which is the point of refusing.
      expect(await shareLinkFor(THEIRS, theirs)).not.toBeUndefined()
    })
  })

  describe('a token that is not one of ours', () => {
    it.each([
      ['made up', 'aaaaaaaaaaaaaaaaaaaaaa'],
      ['empty', ''],
      ['a path traversal', '../../etc/passwd'],
      ['a wildcard', "' or '1'='1"],
    ])('shows nothing for %s', async (_what, token) => {
      expect(await sharedEpisode(token)).toBeUndefined()
    })
  })
}
