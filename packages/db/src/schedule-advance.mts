import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

/**
 * Teaches Postgres to finish episodes by itself.
 *
 * A script rather than a migration, because what it installs is not schema:
 * it embeds the deployment's own URL and secret, which differ per
 * environment and have no business in a file that is checked in and replayed
 * everywhere.
 *
 * Why Postgres and not Vercel: Hobby allows **one cron a day**, which is
 * right for a keep-alive ping and useless for pacing an episode through an
 * allowance that refills by the second. `pg_cron` runs every minute and
 * `pg_net` makes the call without blocking the scheduler. Both ship with
 * Supabase on the free tier (ADR 0027).
 *
 * Run it again whenever the URL or the secret changes; it replaces the job
 * rather than adding a second one.
 */
const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

// The session pooler, like the migrations: this creates extensions and a
// cron job, which the transaction pooler will not carry.
const url = process.env['MIGRATION_DATABASE_URL'] ?? process.env['DATABASE_URL']
const appUrl = process.env['APP_URL']
const secret = process.env['CRON_SECRET'] ?? ''

if (url === undefined || url.length === 0) {
  console.error('DATABASE_URL is not set. See .env.example.')
  process.exit(1)
}

if (appUrl === undefined || appUrl.length === 0) {
  console.error(
    'APP_URL is not set — the database has to know where to call.\n' +
      'Example: APP_URL=https://overtone-five.vercel.app pnpm --filter @overtone/db schedule-advance',
  )
  process.exit(1)
}

if (secret.length === 0) {
  console.warn('CRON_SECRET is empty: the endpoint will accept anyone. Fine locally, not in production.')
}

const JOB = 'overtone-advance-pending'
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} })

await sql`create extension if not exists pg_cron`
await sql`create extension if not exists pg_net`

// Unscheduling first makes this idempotent — running it twice leaves one job,
// not two racing for the same lease.
await sql`select cron.unschedule(${JOB}) where exists (
  select 1 from cron.job where jobname = ${JOB})`

const endpoint = `${appUrl.replace(/\/+$/u, '')}/api/episodes/advance-pending`
const command = `select net.http_post(
  url := ${sql.unsafe(`'${endpoint}'`)},
  headers := ${sql.unsafe(`'${JSON.stringify({ 'content-type': 'application/json', authorization: `Bearer ${secret}` })}'::jsonb`)},
  timeout_milliseconds := 290000
)`

await sql`select cron.schedule(${JOB}, '* * * * *', ${command})`

const [job] = await sql`select jobname, schedule, active from cron.job where jobname = ${JOB}`
console.log(`scheduled ${job?.jobname} ${job?.schedule} active=${job?.active}`)
console.log(`  -> POST ${endpoint}`)

await sql.end()
