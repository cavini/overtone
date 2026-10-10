import type { TimedWord } from '@overtone/core/domain'
import { chunkTranscripts } from '@overtone/db/schema'
import { and, asc, eq, gte } from 'drizzle-orm'
import { linesAfter, type TranscriptSoFar } from '../presenter/transcript-text.js'
import { database } from './wiring.js'

/**
 * What an episode has to read, from one chunk onwards.
 *
 * Its own query rather than `ChunkStore.transcripts`, which deliberately
 * reads *everything*: that port exists for stitching, and stitching needs
 * every chunk and every word timing at once (ADR 0020). Reading an episode's
 * whole word list to answer "anything new?" — every few seconds, for the
 * best part of an hour — would move megabytes a minute out of a free
 * database to say nothing has changed.
 *
 * So the chunk index is pushed into the `where`. A reader who is up to date
 * costs one indexed lookup that returns no rows.
 */
export async function transcriptSoFar(
  episodeId: string,
  from: number,
): Promise<TranscriptSoFar> {
  const since = Math.max(0, Math.trunc(from))

  const rows = await database()
    .select({
      index: chunkTranscripts.index,
      offsetMs: chunkTranscripts.offsetMs,
      words: chunkTranscripts.words,
      segmentStartsMs: chunkTranscripts.segmentStartsMs,
    })
    .from(chunkTranscripts)
    .where(and(eq(chunkTranscripts.episodeId, episodeId), gte(chunkTranscripts.index, since)))
    .orderBy(asc(chunkTranscripts.index))

  return linesAfter(
    rows.map((row) => ({
      index: row.index,
      offsetMs: row.offsetMs,
      words: (row.words ?? []) as readonly TimedWord[],
      segmentStartsMs: row.segmentStartsMs ?? [],
    })),
    since,
  )
}
