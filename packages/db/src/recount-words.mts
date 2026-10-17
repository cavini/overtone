import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { series } from './schema.js'
import { recountSeriesTerms } from './repositories/drizzle-series-repository.js'

/**
 * Rebuilds every series' word totals by hand.
 *
 * Normally unnecessary: the totals are rebuilt when an episode finishes
 * analysis, which is the only moment they move. This is for the times that
 * did not happen — a roll-up that failed to write, episodes changed by a
 * script, or a bulk backfill whose last rebuild came before the last episode.
 *
 *     pnpm --filter @overtone/db db:recount-words
 */
const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const url = process.env['MIGRATION_DATABASE_URL'] ?? process.env['DATABASE_URL']
if (url === undefined || url.length === 0) {
  console.error('DATABASE_URL is not set. See .env.example.')
  process.exit(1)
}

const sql = postgres(url, { max: 1, onnotice: () => {} })
const db = drizzle(sql)

try {
  const libraries = await db.select({ id: series.id, title: series.title }).from(series)
  if (libraries.length === 0) {
    console.log('no series to count')
  }

  for (const library of libraries) {
    const words = await recountSeriesTerms(db, library.id)
    console.log(`"${library.title}" — ${String(words)} words totalled`)
  }
} catch (error) {
  console.error('\ncould not rebuild the totals:\n')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await sql.end()
}
