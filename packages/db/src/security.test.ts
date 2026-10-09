// ADR 0012 · the dependency rule, enforced in the database as well
//
// The classic Supabase data leak is a table added later that never had
// row-level security switched on. It reads fine, writes fine, and is visible
// to everyone with an API key. These assertions derive the table list from the
// schema itself, so adding a table without a policy fails the build rather
// than quietly exposing somebody's episodes.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableName, is, Table } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as schema from './schema.js'

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations')

/**
 * Whitespace is collapsed so these assertions describe what the SQL means
 * rather than how it is laid out — the statements below are aligned for
 * readability, and a test that broke on indentation would be testing the
 * formatter.
 */
const sql = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => readFileSync(resolve(migrationsDir, name), 'utf8'))
  .join('\n')
  .toLowerCase()
  .replaceAll(/[ \t]+/gu, ' ')

// `is` rather than a hand-written type predicate: every table in the schema
// has its own literal type, none of which is assignable to the generic one.
const tables = Object.values(schema)
  .filter((value) => is(value, Table))
  .map((table) => getTableName(table))

/** Hangs off a series, so its policy must resolve membership. */
const SERIES_SCOPED = [
  'series', 'series_members', 'topics', 'topic_terms', 'episodes',
  'transcripts', 'segments', 'insights', 'term_counts', 'mentions', 'queries',
]

/**
 * Column names as the database sees them, parsed out of the generated DDL.
 *
 * Not from the schema object: Drizzle's property names and its column names
 * are allowed to differ, and that gap is exactly where the bug lived. A
 * shared helper named a column `user_id` while the property was `ownerId`,
 * every policy referenced `owner_id`, the whole thing typechecked, and the
 * migration failed on the live database with `column "owner_id" does not
 * exist`.
 */
const columnsByTable = new Map<string, Set<string>>()
for (const block of sql.matchAll(/create table "(\w+)" \(([\s\S]*?)\n\);/g)) {
  const table = block[1] ?? ''
  const columns = new Set(
    [...(block[2] ?? '').matchAll(/^\s*"(\w+)"\s+\w/gm)].map((m) => m[1] ?? ''),
  )
  columnsByTable.set(table, columns)
}

const everyColumn = new Set([...columnsByTable.values()].flatMap((set) => [...set]))

describe('the policies only reference columns that exist', () => {
  it('parsed the schema out of the migration', () => {
    expect(columnsByTable.size).toBeGreaterThanOrEqual(13)
    expect(everyColumn.has('owner_id')).toBe(true)
  })

  // `series_members.series_id`, `topics.series_id`, and so on.
  it('resolves every qualified reference', () => {
    const unknown: string[] = []

    for (const [, table, column] of sql.matchAll(/\b(\w+)\.(\w+)\b/g)) {
      const columns = columnsByTable.get(table ?? '')
      if (columns === undefined) continue
      if (!columns.has(column ?? '')) unknown.push(`${table}.${column}`)
    }

    expect(unknown).toEqual([])
  })

  // `using (owner_id = auth.uid())` — unqualified, and the form that broke.
  it('resolves every bare column compared against auth.uid()', () => {
    const unknown: string[] = []

    for (const [, column] of sql.matchAll(/\b([a-z][a-z0-9_]*)\s*=\s*auth\.uid\(\)/g)) {
      if (!everyColumn.has(column ?? '')) unknown.push(column ?? '')
    }

    expect(unknown).toEqual([])
  })
})

describe('row-level security', () => {
  it('found the schema tables to check', () => {
    expect(tables.length).toBeGreaterThanOrEqual(13)
  })

  it.each(tables)('is enabled on %s', (table) => {
    expect(sql).toContain(`alter table "${table}" enable row level security`)
  })

  it.each(SERIES_SCOPED)('%s has a policy', (table) => {
    expect(sql).toMatch(new RegExp(`create policy "[^"]+" on "${table}"`))
  })

  // Membership, not ownership. Scoping a read by `owner_id` works perfectly
  // while one person has one series and breaks the day a co-host is invited.
  it('resolves access through membership, not ownership', () => {
    expect(sql).toContain('is_series_member')
    const readPolicies = sql.match(/create policy[\s\S]*?using \([^;]*?\)/g) ?? []
    const ownershipReads = readPolicies.filter(
      (policy) => policy.includes('owner_id') && !policy.includes('_owner_write'),
    )
    expect(ownershipReads).toEqual([])
  })

  // A policy on series_members that queries series_members recurses, and
  // Postgres refuses outright. The definer-rights function breaks the cycle.
  it('breaks the recursion with a definer-rights function', () => {
    expect(sql).toMatch(/create or replace function public\.is_series_member/)
    expect(sql).toContain('security definer')
  })

  // A definer-rights function with a mutable search path is a privilege
  // escalation, not a style preference.
  it('pins the search path on that function', () => {
    expect(sql).toMatch(/set search_path\s*=/)
  })

  it('does not hand that function to anonymous callers', () => {
    expect(sql).toContain('revoke all on function public.is_series_member(uuid) from public')
    expect(sql).toContain('grant execute on function public.is_series_member(uuid) to authenticated')
  })

  // The dictionary is shared open data and holds nothing about anyone.
  it('lets any signed-in user read the dictionary', () => {
    expect(sql).toMatch(/create policy "[^"]*lemmas[^"]*" on "lemmas"\s*\n\s*for select/)
  })

  // RLS on with no policy is deny-all, which is what the keep-alive table
  // wants: only the service key touches it.
  it('leaves the heartbeat table with no policy at all', () => {
    expect(sql).toContain('alter table "heartbeats" enable row level security')
    expect(sql).not.toMatch(/create policy "[^"]+" on "heartbeats"/)
  })

  // An anonymous visitor cannot be asked which episode they may see, and a
  // policy broad enough to let them look would be broad enough to enumerate.
  it('does not try to serve public share links through a policy', () => {
    expect(sql).not.toMatch(/create policy[^;]*to anon/)
    expect(sql).not.toMatch(/create policy[^;]*share_token/)
  })
})
