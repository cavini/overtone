import type { ChunkTranscript } from '../domain/audio-chunk.js'

/**
 * Where a chunk's transcript lives between steps.
 *
 * An episode of this show cannot be transcribed inside one hour (ADR 0020),
 * so the work spans hours and process lifetimes. Each chunk's transcript has
 * to be durable the moment it arrives — the alternative is re-spending
 * allowance that has already been paid for, which on a budget of three
 * episodes a day is the one mistake worth designing against.
 */
export interface ChunkStore {
  /** Which chunks already have a transcript, cheaply. */
  transcribedIndexes(episodeId: string): Promise<readonly number[]>
  /** Every stored chunk transcript, for stitching once the set is complete. */
  transcripts(episodeId: string): Promise<readonly ChunkTranscript[]>
  save(episodeId: string, chunk: ChunkTranscript): Promise<void>
}
