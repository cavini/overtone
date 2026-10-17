import type {
  EpisodeFailure,
  EpisodeStatus,
  EpisodeStore,
  StoredAnalysis,
} from '@overtone/core'
import { eq } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import {
  episodes,
  insights,
  mentions,
  segments,
  termCounts,
  transcripts,
} from '../schema.js'

/**
 * Any Drizzle Postgres database, whichever driver built it.
 *
 * The schema parameter is left open deliberately: the real driver and the
 * proxy the tests use declare it differently, and pinning it to one would
 * make the repository untestable without a live connection.
 */
type Database = PgDatabase<PgQueryResultHKT, Record<string, unknown>>

/** The subset of a database that can open a transaction. */
interface Transactional {
  transaction<T>(body: (tx: Database) => Promise<T>): Promise<T>
}

/**
 * Writes one run of the pipeline.
 *
 * Takes the transaction rather than opening one, which is what makes the
 * statements testable: a proxy driver can record SQL but cannot open a
 * transaction, so atomicity and the statements are verified separately.
 *
 * Clearing before inserting is not housekeeping. ADR 0005 made re-analysis
 * free — the transcript is kept so counting can be re-run for nothing — which
 * means re-runs are frequent, and a second run that added to the first
 * instead of replacing it would double every count in the library.
 */
export async function writeAnalysis(
  tx: Database,
  episodeId: string,
  analysis: StoredAnalysis,
): Promise<void> {
  // Segments go with their transcript, and `transcripts` cascades, so
  // deleting the transcript takes its segments with it.
  await tx.delete(mentions).where(eq(mentions.episodeId, episodeId))
  await tx.delete(termCounts).where(eq(termCounts.episodeId, episodeId))
  await tx.delete(insights).where(eq(insights.episodeId, episodeId))
  await tx.delete(transcripts).where(eq(transcripts.episodeId, episodeId))

  const [inserted] = await tx
    .insert(transcripts)
    .values({
      episodeId,
      provider: analysis.transcript.provider,
      providerModel: analysis.transcript.providerModel,
      rawProviderPayload: analysis.transcript.rawProviderPayload,
      fullText: analysis.transcript.fullText,
      normalizationVersion: analysis.transcript.normalizationVersion,
      vocabularyVersion: analysis.transcript.vocabularyVersion,
    })
    .returning({ id: transcripts.id })

  const transcriptId = inserted?.id
  if (transcriptId === undefined) {
    throw new Error('transcript insert returned no id')
  }

  if (analysis.segments.length > 0) {
    // One statement per table rather than one per row: an episode has
    // hundreds of segments, and a round trip each would dominate the write.
    await tx.insert(segments).values(
      analysis.segments.map((segment) => ({
        transcriptId,
        position: segment.position,
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text,
      })),
    )
  }

  await tx.insert(insights).values({
    episodeId,
    pipelineVersion: analysis.insight.pipelineVersion,
    totalTokens: analysis.insight.totalTokens,
    wordTokens: analysis.insight.wordTokens,
    stopWordTokens: analysis.insight.stopWordTokens,
    fillerTokens: analysis.insight.fillerTokens,
    uniqueTerms: analysis.insight.uniqueTerms,
    wordsPerMinute: analysis.insight.wordsPerMinute,
    fillersPerMinute: analysis.insight.fillersPerMinute,
  })

  if (analysis.termCounts.length > 0) {
    await tx.insert(termCounts).values(
      analysis.termCounts.map((count) => ({
        episodeId,
        lemma: count.term,
        surfaceForms: [...count.surfaceForms],
        count: count.count,
        heuristic: count.heuristic,
      })),
    )
  }

  if (analysis.mentions.length > 0) {
    await tx.insert(mentions).values(
      analysis.mentions.map((mention) => ({
        episodeId,
        topicId: mention.topicId,
        matchedText: mention.matchedText,
        startMs: mention.startMs,
        endMs: mention.endMs,
      })),
    )
  }
}

/**
 * Stores an episode's analysis and moves its status.
 *
 * The whole analysis goes in one transaction. A half-written one — counts with
 * no transcript behind them — is worse than none at all, because the page
 * looks finished and shows zero of everything.
 */
export class DrizzleEpisodeStore implements EpisodeStore {
  constructor(private readonly db: Database & Transactional) {}

  async setStatus(
    episodeId: string,
    status: EpisodeStatus,
    failure?: EpisodeFailure,
  ): Promise<void> {
    const { code, ...params } = failure ?? { code: null }

    await this.db
      .update(episodes)
      .set({
        status,
        // Always written, so a successful re-run clears the failure that was
        // there before rather than leaving a stale reason on a ready episode.
        failureCode: code,
        failureParams: failure === undefined ? null : params,
      })
      .where(eq(episodes.id, episodeId))
  }

  async save(episodeId: string, analysis: StoredAnalysis): Promise<void> {
    await this.db.transaction((tx) => writeAnalysis(tx, episodeId, analysis))
  }
}
