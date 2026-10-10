import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

/**
 * Hands the pre-accounts library to a real person.
 *
 * Everything uploaded under the shared password sits in one series owned by
 * a fixed id that belongs to nobody. Once sign-in exists, nobody can see it
 * — the library a person reaches is the one whose owner is them.
 *
 * Deliberately a script and not something that happens on first sign-in.
 * Adopting it automatically would hand the group's episodes to whoever
 * signed in first, and signing in is now open to anybody the invitation
 * list allows.
 *
 *     pnpm --filter @overtone/db claim-library you@example.com
 */
const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const M0_OWNER = '00000000-0000-0000-0000-00000000000a'
const email = process.argv[2]
const url = process.env['MIGRATION_DATABASE_URL'] ?? process.env['DATABASE_URL']

if (email === undefined || !email.includes('@')) {
  console.error('Usage: pnpm --filter @overtone/db claim-library you@example.com')
  process.exit(1)
}

if (url === undefined || url.length === 0) {
  console.error('DATABASE_URL is not set. See .env.example.')
  process.exit(1)
}

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} })

const [account] = await sql`select id from auth.users where lower(email) = lower(${email}) limit 1`
if (account === undefined) {
  console.error(`No account for ${email}. Sign in once first, then run this.`)
  await sql.end()
  process.exit(1)
}

const orphaned = await sql`select id, title from series where owner_id = ${M0_OWNER}`
if (orphaned.length === 0) {
  console.log('Nothing to claim: no library is left over from before sign-in.')
  await sql.end()
  process.exit(0)
}

for (const series of orphaned) {
  await sql`update series set owner_id = ${account.id} where id = ${series.id}`
  await sql`
    insert into series_members (series_id, user_id, role)
    values (${series.id}, ${account.id}, 'owner')
    on conflict do nothing`
  // The old membership row points at an id nobody can sign in as.
  await sql`delete from series_members where series_id = ${series.id} and user_id = ${M0_OWNER}`

  const [count] = await sql`select count(*)::int as n from episodes where series_id = ${series.id}`
  console.log(`claimed "${series.title}" — ${count?.n ?? 0} episodes — for ${email}`)
}

await sql.end()
