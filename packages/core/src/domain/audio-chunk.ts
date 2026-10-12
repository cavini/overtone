import type { TimedWord } from './timed-word.js'

/**
 * One slice of an episode, to be transcribed on its own.
 *
 * Boundaries are **exactly where the audio is cut**. The browser slices at
 * the millisecond named here, so the offsets used for stitching and the
 * points the knife fell are the same numbers by construction.
 *
 * This said the opposite — that the browser moved each boundary to the
 * nearest silence and reported the actual one back. Neither half was ever
 * built: there is no silence detection in the repository, and no channel
 * for the browser to report a boundary it moved. Timestamps are therefore
 * sound, and every seam falls wherever the clock says, usually mid-word.
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
