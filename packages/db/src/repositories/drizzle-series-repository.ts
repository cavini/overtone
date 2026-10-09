import type { EpisodeSummary, SeriesRepository, Topic, TopicTally } from '@overtone/core'
import { and, eq, exists, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import {
  episodes,
  insights,
  mentions,
  seriesMembers,
  topicTerms,
  topics,
} from '../schema.js'

/**
 * Any Drizzle Postgres database. Left generic so the same repository runs
 * against the real driver and against the proxy the tests use.
 */
type Database = PgDatabase<PgQueryResultHKT, Record<string, never>>

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
}
