// US-040 · ADR 0020
//
// The chunk store against real Postgres. Nothing else can tell you whether
// the words survive a JSONB round trip, or whether the composite unique
// constraint the upsert depends on actually exists.
//
// Skipped without DATABASE_URL, because CI has no database.
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describeChunkStore } from '@overtone/core/testing'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { describe, it } from 'vitest'
import { episodes, series, seriesMembers } from '../schema.js'
import { DrizzleChunkStore } from './drizzle-chunk-store.js'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const url = process.env['DATABASE_URL']
const OWNER = '00000000-0000-0000-0000-00000000c0de'

if (url === undefined || url.length === 0) {
  describe('DrizzleChunkStore (ChunkStore contract)', () => {
    it.skip('needs DATABASE_URL', () => {})
  })
} else {
  const client = postgres(url, { prepare: false, max: 5, onnotice: () => {} })
  const db = drizzle(client)

  describeChunkStore('DrizzleChunkStore', async () => {
    // Chunks reference an episode, so the rows have to exist. Rebuilt each
    // time, under an owner id no real account can have.
    await db.delete(series).where(eq(series.ownerId, OWNER))

    const [created] = await db
      .insert(series)
      .values({ ownerId: OWNER, title: 'Contract' })
      .returning({ id: series.id })
    const seriesId = created?.id ?? ''
    await db.insert(seriesMembers).values({ seriesId, userId: OWNER, role: 'owner' })

    const made = await db
      .insert(episodes)
      .values([
        { seriesId, number: 1, title: 'A' },
        { seriesId, number: 2, title: 'B' },
      ])
      .returning({ id: episodes.id })

    return {
      store: new DrizzleChunkStore(db),
      episodeIds: [made[0]?.id ?? '', made[1]?.id ?? ''] as const,
      // The episodes are new each time, so their chunks start empty.
      reset: () => Promise.resolve(),
      teardown: async () => {
        await db.delete(series).where(eq(series.ownerId, OWNER))
      },
    }
  })
}
