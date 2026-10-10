import type { ChunkStore, ChunkTranscript } from '@overtone/core'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { chunkTranscripts } from '../schema.js'

type Database = PgDatabase<PgQueryResultHKT, Record<string, unknown>>

/** One word as stored, relative to its chunk. */
interface StoredWord {
  readonly text: string
  readonly startMs: number
  readonly endMs: number
}

/**
 * Chunk transcripts, which have to survive between steps.
 *
 * An episode of this show cannot be transcribed inside one hour (ADR 0020),
 * so the work spans hours and process lifetimes. Each chunk is written the
 * moment it arrives — before its cost is even recorded — because losing a
 * chunk means re-spending allowance from a budget of three episodes a day.
 */
export class DrizzleChunkStore implements ChunkStore {
  constructor(private readonly db: Database) {}

  async transcribedIndexes(episodeId: string): Promise<readonly number[]> {
    // Only the index. A two-hour episode's words are megabytes, and pacing
    // only needs to know which chunks are already done.
    const rows = await this.db
      .select({ index: chunkTranscripts.index })
      .from(chunkTranscripts)
      .where(eq(chunkTranscripts.episodeId, episodeId))
      .orderBy(asc(chunkTranscripts.index))

    return rows.map((row) => row.index)
  }

  async transcripts(episodeId: string): Promise<readonly ChunkTranscript[]> {
    const rows = await this.db
      .select({
        index: chunkTranscripts.index,
        offsetMs: chunkTranscripts.offsetMs,
        words: chunkTranscripts.words,
        segmentStartsMs: chunkTranscripts.segmentStartsMs,
        providerModel: chunkTranscripts.providerModel,
      })
      .from(chunkTranscripts)
      .where(eq(chunkTranscripts.episodeId, episodeId))
      .orderBy(asc(chunkTranscripts.index))

    return rows.map((row) => ({
      index: row.index,
      offsetMs: row.offsetMs,
      words: (row.words ?? []) as readonly StoredWord[],
      segmentStartsMs: row.segmentStartsMs ?? [],
      providerModel: row.providerModel ?? undefined,
    }))
  }

  async transcript(episodeId: string, index: number): Promise<ChunkTranscript | undefined> {
    // Both halves of the key in the `where`, so this is an indexed lookup of
    // one row rather than a scan of the episode.
    const [row] = await this.db
      .select({
        index: chunkTranscripts.index,
        offsetMs: chunkTranscripts.offsetMs,
        words: chunkTranscripts.words,
        segmentStartsMs: chunkTranscripts.segmentStartsMs,
        providerModel: chunkTranscripts.providerModel,
      })
      .from(chunkTranscripts)
      .where(and(eq(chunkTranscripts.episodeId, episodeId), eq(chunkTranscripts.index, index)))
      .limit(1)

    if (row === undefined) return undefined

    return {
      index: row.index,
      offsetMs: row.offsetMs,
      words: (row.words ?? []) as readonly StoredWord[],
      segmentStartsMs: row.segmentStartsMs ?? [],
      providerModel: row.providerModel ?? undefined,
    }
  }

  async save(episodeId: string, chunk: ChunkTranscript): Promise<void> {
    // Upsert, not insert. A retry that duplicated the chunk would double
    // every word in that stretch of the episode; one that threw would lose
    // work already paid for. Neither is acceptable, so the write is
    // idempotent on (episode, index).
    await this.db
      .insert(chunkTranscripts)
      .values({
        episodeId,
        index: chunk.index,
        offsetMs: chunk.offsetMs,
        words: chunk.words,
        // Written on both paths. Left off the insert once, which made every
        // line in production fall back to punctuation without a word said
        // about it.
        segmentStartsMs: [...(chunk.segmentStartsMs ?? [])],
        providerModel: chunk.providerModel ?? null,
      })
      .onConflictDoUpdate({
        target: [chunkTranscripts.episodeId, chunkTranscripts.index],
        set: {
          offsetMs: chunk.offsetMs,
          words: chunk.words,
          segmentStartsMs: [...(chunk.segmentStartsMs ?? [])],
          providerModel: chunk.providerModel ?? null,
          createdAt: sql`now()`,
        },
      })
  }
}
