import {
  MATCH_CLOSE,
  MATCH_OPEN,
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
/**
 * `StartSel`/`StopSel` are control characters, not markup.
 *
 * The page splits on them and emits its own elements, so nothing downstream
 * has to trust — or sanitise — HTML assembled inside a SQL string.
 *
 * `HighlightAll` because a segment is about three seconds of speech and the
 * reader wants all of it; the default returns a fragment of a fragment.
 */
const HEADLINE_OPTIONS = `StartSel=${MATCH_OPEN}, StopSel=${MATCH_CLOSE}, HighlightAll=TRUE`

/**
 * The text with the matching words marked.
 *
 * Marked here rather than in the browser because only the database knows
 * *why* a segment matched: the search stems, so `ano` matches `anos` and
 * `falar` matches `falou`. Comparing strings up in the page would bold
 * neither, and would bold the wrong thing in the cases it did hit.
 *
 * Which configuration did the matching decides which one highlights — a
 * segment found by the English half must be marked by the English half, or
 * the words come back unmarked.
 */
function highlightedText(query: string): SQL<string> {
  const branches = CONFIGURATIONS.map(
    (configuration) =>
      sql`when ${indexedText(configuration)} @@ ${asked(configuration, query)} then ts_headline(${named(configuration)}, ${segments.text}, ${asked(configuration, query)}, ${HEADLINE_OPTIONS})`,
  )

  // Nothing matched is not a state this is reached in, but a `case` with no
  // `else` yields null, and a null quote would blank the result.
  return sql<string>`case ${sql.join(branches, sql` `)} else ${segments.text} end`
}

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

  async search(
    seriesId: string,
    query: string,
    perEpisode: number,
  ): Promise<readonly TranscriptMatch[]> {
    /*
     * Numbered within each episode, then cut at the budget — so every
     * episode that matched is represented.
     *
     * It was one flat `limit` ordered busiest-episode-first. That sounds
     * like a ranking and behaves like a cliff: measured on a real library,
     * the busiest episode's 321 matching lines took all 300 rows and the
     * other fourteen episodes were never looked at, so the answer read as
     * "it was only said there".
     *
     * A window function cannot go in `where`, which is why this is a
     * subquery rather than a filter. It costs nothing worth measuring —
     * the work is the index scan, and the rows were always the cheap half.
     */
    const ranked = this.db
      .select({
        episodeId: episodes.id,
        episodeNumber: episodes.number,
        episodeTitle: episodes.title,
        startMs: segments.startMs,
        endMs: segments.endMs,
        text: segments.text,
        // Aliased because a raw SQL field cannot be read back out of a
        // subquery without a name of its own.
        highlighted: highlightedText(query).as('highlighted'),
        rank: sql<number>`row_number() over (
          partition by ${episodes.id} order by ${segments.startMs} asc
        )`.as('rank'),
        /*
         * How many the episode has in all, so the budget can be spread over
         * them rather than spent on whichever came first.
         */
        /*
         * Cast, because `count(*)` is a bigint and a bigint arrives as a
         * *string*. `sql<number>` is a claim about the type, not a
         * conversion — so summing these concatenated them: a match count
         * came back as "015518018815314918817022..." instead of 4,208.
         */
        matches: sql<number>`(count(*) over (partition by ${episodes.id}))::int`.as('matches'),
      })
      .from(segments)
      .innerJoin(transcripts, eq(transcripts.id, segments.transcriptId))
      .innerJoin(episodes, eq(episodes.id, transcripts.episodeId))
      .where(
        and(
          matchedInAnyLanguage(query),
          eq(episodes.status, 'ready'),
          // One library at a time. Search reads every stored segment, so
          // without this it reads everybody's.
          eq(episodes.seriesId, seriesId),
        ),
      )
      .as('ranked')

    const rows = await this.db
      .select({
        episodeId: ranked.episodeId,
        episodeNumber: ranked.episodeNumber,
        episodeTitle: ranked.episodeTitle,
        startMs: ranked.startMs,
        endMs: ranked.endMs,
        text: ranked.text,
        highlighted: ranked.highlighted,
        // Already computed for the sampling below; returned so the page can
        // say how much of the answer it is showing.
        episodeMatches: ranked.matches,
      })
      .from(ranked)
      /*
       * Every nth hit, spread across the episode — not the first n of it.
       *
       * Taking the earliest hits was the first version of this cap and it was
       * wrong in a way that looked right: measured on the real library, every
       * moment for a word said 2,500 times landed in the opening 13 minutes
       * of episodes running 35 to 90. The rest of each episode was invisible
       * and the answer looked complete.
       *
       * `greatest(1, …)` so an episode with fewer hits than the budget
       * returns all of them rather than dividing by less than one — and
       * `rank - 1` so the step starts at the first hit. Written as
       * `rank % step = 1` first, which is silently empty when the step is 1:
       * every rank mod 1 is zero, so the episodes under the budget — the
       * ones that should return everything — returned nothing.
       */
      .where(
        sql`(${ranked.rank} - 1) % greatest(1, ceil(${ranked.matches}::numeric / ${perEpisode})) = 0`,
      )
      // Newest episode first, then in the order it was said. The reader is
      // looking at a series, so the most recent conversation leads.
      .orderBy(desc(ranked.episodeNumber), asc(ranked.startMs))

    return rows
  }
}
