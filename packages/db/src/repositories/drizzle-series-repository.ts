import type {
  EpisodeSummary,
  SeriesRepository,
  SeriesTermTotal,
  Topic,
  TopicTally,
} from '@overtone/core'
import { and, asc, desc, eq, exists, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import {
  episodes,
  insights,
  mentions,
  seriesMembers,
  seriesTermTotals,
  termCounts,
  topicTerms,
  topics,
} from '../schema.js'

/**
 * Any Drizzle Postgres database. Left generic so the same repository runs
 * against the real driver and against the proxy the tests use.
 */
/**
 * Any Drizzle Postgres database, whichever driver built it.
 *
 * The schema parameter is left open deliberately: the real driver and the
 * proxy the tests use declare it differently, and pinning it to one would
 * make the repository untestable without a live connection.
 */
type Database = PgDatabase<PgQueryResultHKT, Record<string, unknown>>

/**
 * Reads a series for one person.
 *
 * Every query is scoped by **membership**, not by ownership. That is the
 * whole substance of ADR 0012: a series has members from the first migration,
 * so inviting a co-host is a row insert rather than a migration that touches
 * every query and every policy. Scoping by `owner_id` would work perfectly
 * while one person has one series, and break the day a second host appears.
 *
 * The scoping lives here as well as in the database's row-level security,
 * deliberately. Policies protect the anonymous client; this protects the
 * server, which holds a key that can bypass them.
 */
export class DrizzleSeriesRepository implements SeriesRepository {
  constructor(
    private readonly db: Database,
    private readonly userId: string,
  ) {}

  /** `exists (select 1 from series_members where …)` — the one predicate. */
  private memberOf(seriesId: string) {
    return exists(
      this.db
        .select({ one: sql`1` })
        .from(seriesMembers)
        .where(
          and(
            eq(seriesMembers.seriesId, seriesId),
            eq(seriesMembers.userId, this.userId),
          ),
        ),
    )
  }

  async episodes(seriesId: string): Promise<readonly EpisodeSummary[]> {
    // A left join, because an episode still being transcribed has no insight
    // row yet and the library still has to list it.
    const rows = await this.db
      .select({
        id: episodes.id,
        number: episodes.number,
        title: episodes.title,
        recordedOn: episodes.recordedOn,
        status: episodes.status,
        durationMs: episodes.durationMs,
        wordTokens: sql<number>`coalesce(${insights.wordTokens}, 0)`.mapWith(Number),
        uniqueTerms: sql<number>`coalesce(${insights.uniqueTerms}, 0)`.mapWith(Number),
      })
      .from(episodes)
      .leftJoin(insights, eq(insights.episodeId, episodes.id))
      .where(and(eq(episodes.seriesId, seriesId), this.memberOf(seriesId)))
      .orderBy(episodes.number)

    return rows
  }

  async topics(seriesId: string): Promise<readonly Topic[]> {
    // The spellings are gathered in the database rather than in a second
    // round trip: one query per read keeps the series page a fixed cost
    // however many jokes the group tracks.
    const rows = await this.db
      .select({
        id: topics.id,
        name: topics.name,
        patterns: sql<string[]>`coalesce(
          array_agg(${topicTerms.pattern}) filter (where ${topicTerms.pattern} is not null),
          '{}'
        )`,
      })
      .from(topics)
      .leftJoin(topicTerms, eq(topicTerms.topicId, topics.id))
      .where(and(eq(topics.seriesId, seriesId), this.memberOf(seriesId)))
      .groupBy(topics.id, topics.name)
      .orderBy(topics.name)

    return rows
  }

  async topicTallies(seriesId: string): Promise<readonly TopicTally[]> {
    // Counting rows in `mentions`, never re-reading transcripts. This is the
    // aggregate the series view renders from, and the one the assistant will
    // query for "how many times ever" — which is why it exists already.
    const rows = await this.db
      .select({
        episodeId: mentions.episodeId,
        topicId: mentions.topicId,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(mentions)
      .innerJoin(episodes, eq(episodes.id, mentions.episodeId))
      .where(and(eq(episodes.seriesId, seriesId), this.memberOf(seriesId)))
      .groupBy(mentions.episodeId, mentions.topicId)

    return rows
  }

  /**
   * The stored totals, read straight off the index.
   *
   * No aggregation here. These were totalled when an episode last finished
   * analysis, which is the only moment they move — so a page load, a second
   * reader and a tenth fold-open all read the same rows rather than asking
   * the database to add the same numbers up again.
   */
  async topTerms(seriesId: string, howMany: number): Promise<readonly SeriesTermTotal[]> {
    const rows = await this.db
      .select({
        term: seriesTermTotals.term,
        total: seriesTermTotals.total,
        episodes: seriesTermTotals.episodes,
        heuristic: seriesTermTotals.heuristic,
      })
      .from(seriesTermTotals)
      .where(and(eq(seriesTermTotals.seriesId, seriesId), this.memberOf(seriesId)))
      // Then the word itself, so two on the same total come back in the same
      // order every time rather than whichever the planner happened to emit.
      .orderBy(desc(seriesTermTotals.total), asc(seriesTermTotals.term))
      .limit(howMany)

    return rows
  }
}

/**
 * Rebuilds a series' word totals from its episodes.
 *
 * A function rather than a method on `DrizzleSeriesRepository`, because that
 * class scopes every query to a signed-in member and this has nobody to
 * scope to: it runs from the scheduled step, which has no user. Hiding an
 * unscoped write among member-scoped reads is how one of them quietly loses
 * its check.
 *
 * Safe without one. It reads a series' own finished episodes and writes that
 * series' own roll-up — it cannot be aimed at somebody else's library, and
 * the caller is the pipeline, not a request.
 *
 * One statement: the aggregate and the write are the same round trip, so
 * nothing travels to this process to be added up and sent back. At a hundred
 * episodes that is about 180,000 rows that stay where they are.
 *
 * Everything, not a delta. A correction can make a word's total go *down*,
 * and an episode can be deleted — so adding to what is there would drift
 * upward forever with no reader able to tell. Rebuilding is cheap enough that
 * being obviously right is worth more than being incremental.
 *
 * `ready` only. An episode still transcribing has counts for whichever
 * chunks happened to land, and letting those in makes the totals move for
 * reasons nobody can see.
 */
export async function recountSeriesTerms(db: Database, seriesId: string): Promise<number> {
  const totalled = db
    .select({
      seriesId: episodes.seriesId,
      term: termCounts.lemma,
      total: sql<number>`sum(${termCounts.count})::int`.as('total'),
      episodes: sql<number>`count(distinct ${episodes.id})::int`.as('episodes'),
      /*
       * True if *any* episode grouped the word by stemming rather than from
       * the dictionary — Portuguese stemmers merge `comer` into `com`, so a
       * total resting partly on a guess must not read as solidly as one that
       * is not.
       */
      heuristic: sql<boolean>`bool_or(${termCounts.heuristic})`.as('heuristic'),
      /*
       * Last, and named explicitly, because an insert-from-select has to give
       * every column of the table in its own order. Stamped by the database,
       * so the time is the database's rather than this process's.
       */
      countedAt: sql<Date>`now()`.as('counted_at'),
    })
    .from(termCounts)
    .innerJoin(episodes, eq(episodes.id, termCounts.episodeId))
    .where(and(eq(episodes.seriesId, seriesId), eq(episodes.status, 'ready')))
    .groupBy(episodes.seriesId, termCounts.lemma)

  await db.transaction(async (tx) => {
    // Cleared inside the transaction, so a reader never sees a half-built
    // table — and a word that has dropped out entirely actually goes.
    await tx.delete(seriesTermTotals).where(eq(seriesTermTotals.seriesId, seriesId))
    await tx.insert(seriesTermTotals).select(totalled)
  })

  const [counted] = await db
    .select({ rows: sql<number>`count(*)`.mapWith(Number) })
    .from(seriesTermTotals)
    .where(eq(seriesTermTotals.seriesId, seriesId))

  return counted?.rows ?? 0
}
