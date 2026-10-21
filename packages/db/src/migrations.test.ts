// Guards the generated SQL, not the schema that generated it.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EPISODE_STATUSES, SERIES_ROLES } from '@overtone/core'
import { describe, expect, it } from 'vitest'

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations')

const sql = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => readFileSync(resolve(migrationsDir, name), 'utf8'))
  .join('\n')

describe('the generated migrations', () => {
  it('exist and are checked in', () => {
    expect(sql.length).toBeGreaterThan(0)
  })

  // The bug this exists for: interpolating a value into a `sql` template
  // produces a bind placeholder, which is right for a query and useless in
  // DDL. A migration has no way to supply `$1`, so the whole thing fails to
  // apply — and the schema it was generated from typechecks perfectly.
  it('inlines every value instead of leaving a bind placeholder', () => {
    expect(sql).not.toMatch(/\$\d/)
  })

  it('makes the database enforce the episode statuses, not just TypeScript', () => {
    for (const status of EPISODE_STATUSES) {
      expect(sql).toContain(`'${status}'`)
    }
    expect(sql).toMatch(/CONSTRAINT "episodes_status" CHECK/)
  })

  it('makes the database enforce the member roles', () => {
    for (const role of SERIES_ROLES) {
      expect(sql).toContain(`'${role}'`)
    }
    expect(sql).toMatch(/CONSTRAINT "series_members_role" CHECK/)
  })

  it('creates every table the application reads', () => {
    for (const table of [
      'series', 'series_members', 'topics', 'topic_terms', 'episodes',
      'transcripts', 'segments', 'insights', 'term_counts', 'mentions',
      'queries', 'lemmas', 'heartbeats',
    ]) {
      expect(sql).toContain(`CREATE TABLE "${table}"`)
    }
  })

  // Deleting a series must take its episodes, transcripts and counts with it.
  // "Delete my data" is a promise, and an orphaned row is a broken one.
  it('cascades deletes from a series down to everything beneath it', () => {
    const cascades = sql.match(/ON DELETE cascade/gi) ?? []
    expect(cascades.length).toBeGreaterThanOrEqual(9)
  })

  it('indexes the lemma dictionary by the column it is looked up on', () => {
    expect(sql).toMatch(/CREATE TABLE "lemmas"[\s\S]*?"form" text PRIMARY KEY/)
  })

  /*
   * And then widens that key, because a spelling is not unique across
   * languages. 760 forms sit in both halves of the dictionary with different
   * lemmas — `aches` is `achar` in Portuguese and `ache` in English — so
   * under the original single-column key whichever half loaded second would
   * have overwritten the other, silently.
   */
  it('keys the lemma dictionary by language and form once there are two', () => {
    expect(sql).toMatch(/ALTER TABLE "lemmas" ADD COLUMN IF NOT EXISTS "language"/)
    expect(sql).toMatch(/PRIMARY KEY \("language", "form"\)/)
  })

  // Postgres only uses an expression index when the query's expression
  // matches it exactly, so the configuration names are load-bearing.
  it('indexes the transcripts under both text-search configurations', () => {
    expect(sql).toMatch(/using gin \(to_tsvector\('portuguese', "text"\)\)/)
    expect(sql).toMatch(/using gin \(to_tsvector\('english', "text"\)\)/)
  })
})

/*
 * The journal is what `migrate()` reads. A migration file missing from it is
 * not applied and not reported — it is skipped in silence.
 *
 * Seven of them were. 0016 to 0022 were written by hand and applied by hand,
 * and only the drizzle-generated ones ever reached the journal, so a database
 * built from the migrations came out seven migrations short: no
 * `chunk_starts_ms`, no `episode_corrections`, no `series_term_totals`. The
 * deployed database had them all, because they had been applied directly —
 * which is precisely why nothing noticed for a fortnight. Migrations that do
 * not reproduce the schema are not a backup of it.
 *
 * Found by standing a database up from them for the first time, in CI.
 */
describe('the migration journal', () => {
  const journalled = (): readonly string[] =>
    (
      JSON.parse(readFileSync(resolve(migrationsDir, 'meta/_journal.json'), 'utf8')) as {
        entries: Array<{ tag: string }>
      }
    ).entries.map((entry) => entry.tag)

  const files = (): readonly string[] =>
    readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .map((name) => name.replace(/\.sql$/u, ''))
      .sort()

  it('names every migration that exists', () => {
    expect([...journalled()].sort()).toEqual([...files()])
  })

  // Order is how `migrate()` decides what to run next, and a gap means
  // everything after it is skipped.
  it('is in order, with no gaps', () => {
    expect(journalled()).toEqual([...files()])
  })
})
