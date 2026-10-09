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
}
