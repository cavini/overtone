import {
  AUDIO_LANGUAGES,
  languagePack,
  type TranscriptMatch,
  type TranscriptSearch,
} from '@overtone/core'
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { episodes, segments, transcripts } from '../schema.js'

type Database = PgDatabase<PgQueryResultHKT, Record<string, unknown>>

/**
 * Every text-search configuration the archive is indexed under.
 *
 * Taken from the language packs so that the index (migrations 0006 and
 * 0009), the query and the analysis cannot drift apart. Postgres only uses
 * an expression index when the query's expression matches it exactly —
 * otherwise it silently scans every segment of every episode, which still
 * returns the right answer and gets slower every week.
 */
const CONFIGURATIONS = AUDIO_LANGUAGES.map(
  (language) => languagePack(language).textSearchConfiguration,
)

/** `'portuguese'` as a literal, not a bind placeholder: DDL and this must agree. */
const named = (configuration: string) => sql.raw(`'${configuration}'`)

const indexedText = (configuration: string): SQL =>
  sql`to_tsvector(${named(configuration)}, ${segments.text})`

/*
 * `plainto_tsquery` treats the input as words rather than as query syntax, so
 * an apostrophe or an ampersand someone typed is a character to search for
 * and not an operator to trip over.
 */
const asked = (configuration: string, query: string): SQL =>
  sql`plainto_tsquery(${named(configuration)}, ${query})`

/**
 * Matches a segment in any language the archive is indexed in.
 *
 * Both configurations, for every reader, whatever language the interface is
 * in — the reader's locale is not an input here and never becomes one, which
 * is what keeps a result from moving when somebody switches languages
 * (ADR 0023).
 *
 * Both are needed. `portuguese` is the only one that knows Portuguese verb
 * morphology and Portuguese stop words. `english` is the only one that
 * reduces an English loanword's inflection — the Portuguese stemmer leaves
 * `deploys` and `podcasts` exactly as it found them — and, less obviously,
 * the only one that strips the plural from a *short Portuguese* word, since
 * Snowball only removes a suffix inside the RV region and `anos`, `dias` and
 * `pais` have none.
 *
 * The gate is the part that cannot be left out. A stop-word list is the one
 * piece of a configuration that can turn a question into the whole archive:
 * `que` parses to nothing in Portuguese and to a lexeme in English, where it
 * sits in 2,172 of 6,952 segments. So a query that *any* configuration
 * reduces to nothing is not asked at all. It costs only words that are a
 * stop word in one language and a content word in the other, of which `era`
 * is about the only real example.
 */
function matchedInAnyLanguage(query: string): SQL {
  const searchable = CONFIGURATIONS.map(
    (configuration) => sql`length(${asked(configuration, query)}::text) > 0`,
  )
  const matches = CONFIGURATIONS.map(
    (configuration) =>
      sql`${indexedText(configuration)} @@ ${asked(configuration, query)}`,
  )

  return sql`${sql.join(searchable, sql` and `)} and (${sql.join(matches, sql` or `)})`
}

/** Finds where something was said, using Postgres's own text search. */
export class DrizzleTranscriptSearch implements TranscriptSearch {
  constructor(private readonly db: Database) {}

  async search(query: string, limit: number): Promise<readonly TranscriptMatch[]> {
    const rows = await this.db
      .select({
        episodeId: episodes.id,
        episodeNumber: episodes.number,
        episodeTitle: episodes.title,
        startMs: segments.startMs,
        endMs: segments.endMs,
        text: segments.text,
      })
      .from(segments)
      .innerJoin(transcripts, eq(transcripts.id, segments.transcriptId))
      .innerJoin(episodes, eq(episodes.id, transcripts.episodeId))
      .where(
        and(matchedInAnyLanguage(query), eq(episodes.status, 'ready')),
      )
      // Newest episode first, and in order within it, so the moments above
      // this are built from segments that already run forwards.
      .orderBy(desc(episodes.number), asc(segments.startMs))
      .limit(limit)

    return rows
  }
}
