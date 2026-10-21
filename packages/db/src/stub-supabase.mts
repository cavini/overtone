/**
 * Makes a plain Postgres accept our migrations.
 *
 * Two things in `0001_row_level_security.sql` are Supabase's rather than
 * Postgres': the `authenticated` role that every policy is granted to, and
 * `auth.uid()`, which the policies compare against. Neither exists on a
 * stock server, so the migration fails on its first statement and nothing
 * database-backed can run anywhere but against the real project.
 *
 * Stubbed rather than removed from the migration, because the migration is
 * what production runs and it is right as it is. This is only ever applied
 * to a throwaway database — CI's service container, or a local one — and it
 * is deliberately the smallest thing that lets the real DDL through.
 *
 * `auth.uid()` returns null here, so every policy denies everything. That is
 * the correct reading: a stub cannot authenticate anybody. The suites
 * connect as the owner, which bypasses row-level security exactly as the
 * secret key does in production, so what they exercise is unchanged.
 *
 *   pnpm --filter @overtone/db db:stub-supabase
 */
import postgres from 'postgres'

const url = process.env['MIGRATION_DATABASE_URL'] ?? process.env['DATABASE_URL']
if (url === undefined || url.length === 0) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

/*
 * Refuses to touch anything that is not local. The stub grants a role and
 * redefines a function in the `auth` schema — harmless on a container that
 * is deleted minutes later, and not something to point at a real project.
 */
const host = new URL(url.replace(/^postgres(ql)?:/u, 'http:')).hostname
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`refusing to stub a database that is not local: ${host}`)
  process.exit(1)
}

const sql = postgres(url, { max: 1, onnotice: () => {} })

try {
  // `create role` has no `if not exists`, hence the catch — the script has
  // to be safe to run twice.
  await sql`do $$ begin
    create role authenticated;
  exception when duplicate_object then null; end $$`

  await sql`create schema if not exists auth`
  await sql`create or replace function auth.uid() returns uuid
              language sql stable as $$ select null::uuid $$`

  console.log('stubbed: role authenticated, auth.uid()')
} finally {
  await sql.end()
}
