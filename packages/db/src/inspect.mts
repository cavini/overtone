/** Reports what the live database actually looks like. Read-only. */
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 1, onnotice: () => {} })

try {
  const tables = await sql<Array<{ name: string; rls: boolean; policies: number }>>`
    select c.relname                as name,
           c.relrowsecurity        as rls,
           count(p.polname)::int   as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_policy p on p.polrelid = c.oid
     where n.nspname = 'public' and c.relkind = 'r'
     group by c.relname, c.relrowsecurity
     order by c.relname
  `

  console.log('  table            rls   policies')
  console.log('  ' + '─'.repeat(36))
  for (const t of tables) {
    console.log(
      `  ${t.name.padEnd(16)} ${t.rls ? ' on' : 'OFF'}   ${String(t.policies).padStart(2)}`,
    )
  }

  const fnRows = await sql<Array<{ secdef: boolean; config: string[] | null }>>`
    select p.prosecdef as secdef, p.proconfig as config
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'is_series_member'
  `
  const fn = fnRows[0]

  const checkRows = await sql<Array<{ count: number }>>`
    select count(*)::int from pg_constraint
     where contype = 'c' and conname in ('episodes_status', 'series_members_role')
  `
  const checks = checkRows[0]?.count ?? 0

  const fkRows = await sql<Array<{ count: number }>>`
    select count(*)::int from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
     where c.contype = 'f' and n.nspname = 'public'
  `
  const fks = fkRows[0]?.count ?? 0

  console.log('')
  console.log(`  tables:              ${tables.length}`)
  console.log(`  rls enabled on:      ${tables.filter((t) => t.rls).length}/${tables.length}`)
  console.log(`  policies:            ${tables.reduce((n, t) => n + t.policies, 0)}`)
  console.log(`  foreign keys:        ${fks}`)
  console.log(`  status/role checks:  ${checks}/2`)
  console.log(`  membership function: ${fn === undefined ? 'MISSING' : `security definer=${fn.secdef}, ${fn.config?.join(' ') ?? 'no search_path'}`}`)
} finally {
  await sql.end()
}
