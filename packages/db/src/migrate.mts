/**
 * Applies the checked-in migrations.
 *
 * A script rather than `drizzle-kit migrate` because the CLI hides the
 * database's error behind a spinner, and the error is the whole point when a
 * migration fails.
 *
 *   pnpm --filter @overtone/db migrate
 */
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

// Session mode: DDL and prepared statements need a connection that
// stays put, which the transaction pooler the app uses does not give.
const url = process.env['MIGRATION_DATABASE_URL'] ?? process.env['DATABASE_URL']
if (url === undefined || url.length === 0) {
  console.error('DATABASE_URL is not set. See .env.example.')
  process.exit(1)
}

// `max: 1` because a migration must run as one session, and the pooler will
// otherwise hand out different connections mid-run.
const sql = postgres(url, { max: 1, onnotice: () => {} })

try {
  console.log('applying migrations…')
  await migrate(drizzle(sql), { migrationsFolder: resolve(here, '../migrations') })
  console.log('done')
} catch (error) {
  console.error('\nmigration failed:\n')
  console.error(error instanceof Error ? error.message : error)
  if (error instanceof Error && 'cause' in error && error.cause !== undefined) {
    console.error('\ncause:', error.cause)
  }
  process.exitCode = 1
} finally {
  await sql.end()
}
