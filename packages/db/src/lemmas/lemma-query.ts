import { Param, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { lemmas } from '../schema.js'

/**
 * Any Drizzle Postgres database, whichever driver built it.
 *
 * The schema parameter is left open deliberately: the real driver and the
 * proxy the tests use declare it differently, and pinning it to one would
 * make the repository untestable without a live connection.
 */
type Database = PgDatabase<PgQueryResultHKT, Record<string, unknown>>

/**
 * One row of the dictionary.
 *
 * Declared here rather than imported from the repository that consumes it.
 * Two adapters should not depend on each other, and the shape is the entire
 * contract — the application wires this function into the repository, and
 * TypeScript checks the fit structurally. That composition is the app layer's
 * job, which is exactly where Clean Architecture puts it.
 */
export interface LemmaQueryRow {
  readonly form: string
  readonly lemma: string
}

/**
 * Looks up many surface forms in one query.
 *
 * `= any($1)` rather than `in (…)`: the whole list travels as a single array
 * parameter, where an `in` list would need one placeholder per word and an
 * episode has a few thousand distinct ones.
 *
 * The dictionary is 825,000 rows and is never loaded into memory. A use case
 * asks for the forms one episode actually used and hands the result to the
 * analysis as a plain map, which is what lets a dictionary-backed lemmatiser
 * sit behind an analysis layer that does no I/O at all (ADRs 0014, 0016).
 */
export function lemmaQuery(
  db: Database,
): (forms: readonly string[]) => Promise<readonly LemmaQueryRow[]> {
  return async (forms) =>
    db
      .select({ form: lemmas.form, lemma: lemmas.lemma })
      .from(lemmas)
      // `= any($1)` with the list bound as a single array parameter.
      //
      // `inArray` would read better but expands to one placeholder per value:
      // a few thousand of them for one episode, and different query text
      // every time, so Postgres can never reuse the plan. An array in a `sql`
      // template gets expanded the same way, hence the explicit `Param`.
      .where(sql`${lemmas.form} = any(${new Param([...forms])})`)
}
