import type { TimedWord } from './timed-word.js'

/**
 * One slice of an episode, to be transcribed on its own.
 *
 * Boundaries are a **target, not a cut**. The browser moves each seam to
 * the nearest gap between words before encoding, and reports where they
 * settled before it uploads a single byte — so the offsets used for
 * stitching are the ones the knife actually fell on.
 *
 * The ordering is the load-bearing part. Recording after the upload, or
 * swallowing a failure to record, leaves the server holding the planned
 * boundaries while the bytes follow different ones: every timestamp after a
 * seam wrong, and every number still looking reasonable.
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
