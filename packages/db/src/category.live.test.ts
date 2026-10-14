// US-051 · the library holds several programmes, numbered independently
//
// Against the real database, because the rule being tested is a constraint
// the database enforces and nothing above it can be asked whether it holds.
//
// Skipped without DATABASE_URL, because CI has none.
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { eq } from 'drizzle-orm'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { episodes, series, seriesMembers } from './schema.js'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const url = process.env['DATABASE_URL']

if (url === undefined || url.length === 0) {
  describe('an episode number per category', () => {
    it.skip('needs DATABASE_URL', () => {})
  })
} else {
  const client = postgres(url, { prepare: false, max: 2, onnotice: () => {} })
  const db = drizzle(client)

  /** An owner id no real account can have, so cleanup cannot reach real rows. */
  const OWNER = '00000000-0000-0000-0000-00000000ca01'
  let seriesId = ''

  const add = (category: string | null, number: number, title: string) =>
    db.insert(episodes).values({
      seriesId,
      number,
      title,
      durationMs: 60_000,
      ...(category === null ? {} : { category }),
    })

  /*
   * Why the database's own words and not the thrown message: Drizzle wraps
   * the failure, so `error.message` is "Failed query: insert into …" and the
   * reason is one level down. Asserting on the wrapper passes for a syntax
   * error as happily as for the constraint this is about.
   */
  const refusalFor = async (
    category: string | null,
    number: number,
    title: string,
  ): Promise<string> => {
    try {
      await add(category, number, title)
      return 'it was accepted'
    } catch (error) {
      const cause = (error as { cause?: unknown }).cause
      return cause instanceof Error ? cause.message : String(error)
    }
  }

  beforeAll(async () => {
    const [made] = await db
      .insert(series)
      .values({ ownerId: OWNER, title: 'Categorised' })
      .returning({ id: series.id })
    seriesId = made?.id ?? ''
    await db.insert(seriesMembers).values({ seriesId, userId: OWNER, role: 'owner' })
  })

  afterAll(async () => {
    if (seriesId.length > 0) await db.delete(series).where(eq(series.id, seriesId))
    await client.end()
  })

  describe('an episode number per category', () => {
    /*
     * The whole point. One feed publishes every programme the group makes,
     * each numbering from 1, and they share hosts and running jokes — so they
     * belong in one library rather than one library each. Numbering has to be
     * per programme or the second show's first episode cannot be uploaded.
     */
    it('lets two programmes both have a first episode', async () => {
      await add('Chuva de Canivetes', 1, 'Chuva de canivetes #001')
      await expect(add('Outro Programa', 1, 'Outro Programa #001')).resolves.toBeDefined()
    })

    // Still one episode 2 of a given programme: a genuine duplicate upload
    // must still be refused.
    it('refuses the same number twice in one programme', async () => {
      await add('Chuva de Canivetes', 2, 'Chuva de canivetes #002')

      await expect(refusalFor('Chuva de Canivetes', 2, 'again')).resolves.toMatch(
        /duplicate key value violates unique constraint "episodes_series_number"/u,
      )
    })

    /*
     * Two uncategorised episodes numbered the same are a duplicate, not two
     * programmes. Postgres treats NULLs as distinct in a unique constraint by
     * default, which would quietly allow it — hence `nulls not distinct`.
     */
    it('refuses the same number twice with no category at all', async () => {
      await add(null, 3, 'Sem categoria')

      await expect(refusalFor(null, 3, 'de novo')).resolves.toMatch(
        /duplicate key value violates unique constraint "episodes_series_number"/u,
      )
    })
  })
}
