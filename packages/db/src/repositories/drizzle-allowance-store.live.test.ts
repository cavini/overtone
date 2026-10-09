// US-040 · ADR 0021
//
// The same contract the fake is held to, against real Postgres. The fake's
// arithmetic is TypeScript and the real store's is SQL, so this is the only
// place the two are compared on behaviour rather than on hope.
//
// Skipped without DATABASE_URL, because CI has no database.
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describeAllowanceStore } from '@overtone/core/testing'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { describe, it } from 'vitest'
import { allowance } from '../schema.js'
import { DrizzleAllowanceStore } from './drizzle-allowance-store.js'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const url = process.env['DATABASE_URL']

if (url === undefined || url.length === 0) {
  describe('DrizzleAllowanceStore (AllowanceStore contract)', () => {
    it.skip('needs DATABASE_URL', () => {})
  })
} else {
  // `max: 1` would serialise the concurrency case and prove nothing.
  const client = postgres(url, { prepare: false, max: 5, onnotice: () => {} })
  const db = drizzle(client)

  describeAllowanceStore('DrizzleAllowanceStore', () =>
    Promise.resolve({
      store: new DrizzleAllowanceStore(db),
      now: () => Date.now(),
      reset: async () => {
        await db.delete(allowance)
      },
    }),
  )
}
