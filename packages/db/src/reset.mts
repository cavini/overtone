/**
 * Drops everything this project owns, so migrations can be applied fresh.
 *
 * Destructive, and refuses to run without `--yes`. Useful while the schema is
 * still moving; once there is data worth keeping, a corrective migration is
 * the right answer instead.
 *
 *   pnpm --filter @overtone/db db:reset -- --yes
 *
 * Touches only `public` objects this schema declares, plus Drizzle's journal.
 * Supabase keeps its own tables in `auth`, `storage` and friends, and those
 * are left alone.
 */
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

if (!process.argv.includes('--yes')) {
  console.error('This drops every table. Re-run with --yes if you mean it.')
  process.exit(1)
}

// Session mode: DDL and prepared statements need a connection that
// stays put, which the transaction pooler the app uses does not give.
const url = process.env['MIGRATION_DATABASE_URL'] ?? process.env['DATABASE_URL']
if (url === undefined || url.length === 0) {
  console.error('DATABASE_URL is not set. See .env.example.')
  process.exit(1)
}

const TABLES = [
  'mentions', 'term_counts', 'insights', 'segments', 'transcripts',
  'episodes', 'topic_terms', 'topics', 'queries', 'series_members',
  'series', 'lemmas', 'heartbeats',
]

const sql = postgres(url, { max: 1, onnotice: () => {} })

try {
  for (const table of TABLES) {
    await sql.unsafe(`drop table if exists public."${table}" cascade`)
  }
  await sql.unsafe('drop function if exists public.is_series_member(uuid)')
  await sql.unsafe('drop table if exists drizzle."__drizzle_migrations"')
  await sql.unsafe('drop schema if exists drizzle cascade')
  console.log(`dropped ${TABLES.length} tables, the membership function and the migration journal`)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await sql.end()
}
