import type { TimedWord } from './timed-word.js'

/**
 * One slice of an episode, to be transcribed on its own.
 *
 * Boundaries are a **target, not a cut**. The browser moves each one to the
 * nearest silence before encoding, because a cut through the middle of a word
 * produces two garbage fragments and corrupts the counts at the join. What
 * comes back is therefore close to this plan rather than identical to it, and
 * the offsets used for stitching are the actual ones.
 */
export interface AudioChunk {
  readonly index: number
  readonly startMs: number
  readonly endMs: number
}

/**
 * One chunk's transcript, with timings relative to the chunk itself.
 *
 * `offsetMs` is where the chunk actually began in the episode — supplied by
 * whatever did the splitting, not assumed from the plan.
 */
export interface ChunkTranscript {
  readonly index: number
  readonly offsetMs: number
  readonly words: readonly TimedWord[]
  /**
   * Where the transcriber started each run of speech, relative to the chunk
   * like the word timings are.
   *
   * Optional because chunks stored before this existed have none, and those
   * episodes still have to read.
   */
  readonly segmentStartsMs?: readonly number[] | undefined
  /**
   * Which model produced this chunk.
   *
   * Optional because chunks stored before it was recorded have no record,
   * and inventing one would repeat the mistake it exists to fix.
   */
  readonly providerModel?: string | undefined
}
