import type { TranscriptMatch, TranscriptSearch } from '@overtone/core'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { episodes, segments, transcripts } from '../schema.js'

type Database = PgDatabase<PgQueryResultHKT, Record<string, unknown>>

/**
 * The text-search configuration for the language the audio is in.
 *
 * `portuguese` rather than `simple`, so Postgres stems: a search for
 * "cachorro" finds "cachorros", and "falar" finds "falaram". It also knows
 * the language's stop words, so searching for "de" does not return the
 * whole episode.
 *
 * The index in migration 0006 is built on exactly this expression. Change
 * one and Postgres silently stops using the index and scans every segment
 * of every episode instead — which still works, and gets slower every week.
 */
const CONFIG = 'portuguese'

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
        and(
          // `plainto_tsquery` treats the input as words rather than as query
          // syntax, so an apostrophe or an ampersand someone typed is a
          // character to search for and not an operator to trip over.
          sql`to_tsvector(${sql.raw(`'${CONFIG}'`)}, ${segments.text}) @@ plainto_tsquery(${sql.raw(`'${CONFIG}'`)}, ${query})`,
          eq(episodes.status, 'ready'),
        ),
      )
      /*
       * Busiest episode first, then newest, then in order within it.
       *
       * The limit below is a budget, and it used to be spent newest-first:
       * a term discussed at length in episode 1 vanished the moment 300
       * segments in later episodes mentioned it in passing. Ranking by how
       * many segments of an episode match spends the budget on the
       * conversations somebody is actually looking for.
       *
       * A window function in `order by` is evaluated before the limit, so
       * this ranks across everything that matched rather than reordering a
       * page that was already chosen wrongly.
       */
      .orderBy(
        sql`count(*) over (partition by ${episodes.id}) desc`,
        desc(episodes.number),
        asc(segments.startMs),
      )
      .limit(limit)

    return rows
  }
}
