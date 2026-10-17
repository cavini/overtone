import { settleChunks } from '@overtone/core'
import { FRAME_MS, loudnessProfile } from './loudness.js'
import { encodeWav, SAMPLE_RATE } from './wav.js'

/**
 * Cuts the episode up and sends the pieces straight to storage.
 *
 * This is the only path the audio takes. It does not go through the server:
 * a serverless function accepts about 4.5 MB of body and an episode is a
 * hundred times that, so the caller uploads to a signed URL per chunk and
 * the server never holds a byte of it.
 *
 * Cutting here rather than there is also the only way it can be cut at all.
 * The pieces have to be real audio files — the transcriber fetches each one
 * on its own — and you cannot make one by taking a byte range out of an MP3.
 * Decoding, slicing samples and re-encoding is what produces a file rather
 * than a fragment.
 *
 * **Decoding is injected, and that is the only thing that was ever
 * browser-specific here.** The tab decodes with `AudioContext`; the backfill
 * tool shells out to `ffmpeg`. Everything below — the loudness profile, the
 * seam settling, the ordering of the boundary report against the uploads —
 * is the part that fails silently when it is wrong, so it exists once and
 * both callers run the same copy of it.
 */

export interface ChunkTarget {
  readonly index: number
  readonly startMs: number
  readonly endMs: number
  readonly uploadUrl: string
}

export interface SplitProgress {
  /** Chunks sent so far, of how many. */
  readonly done: number
  readonly total: number
}

/**
 * The whole episode as 16 kHz mono samples.
 *
 * A thunk rather than a function of a file, because the two callers do not
 * hold the same kind of thing: the tab has a `File` the reader picked, and
 * the tool has a path on disk that `ffmpeg` reads itself. Neither is this
 * function's business — it needs samples.
 *
 * 16 kHz because that is what gets sent (`SAMPLE_RATE`), and the chunk
 * arithmetic below converts milliseconds to sample offsets with it. Samples
 * at any other rate would cut every chunk in the wrong place.
 */
export type DecodeAudio = () => Promise<Float32Array>

const CONTENT_TYPE = 'audio/wav'

/**
 * Decodes the episode once, then uploads each chunk in turn.
 */
export async function splitAndUpload(
  decode: DecodeAudio,
  chunks: readonly ChunkTarget[],
  onProgress: (progress: SplitProgress) => void,
  /**
   * Told where the seams settled, before a single byte is uploaded.
   *
   * Ordering is the whole point. The audio is cut on the settled boundaries,
   * so if they were recorded *after* the upload and that call failed, the
   * server would hold the planned boundaries while the bytes on disk follow
   * different ones — and every timestamp after a seam would be wrong, with
   * every number still looking reasonable. Recording first means a failure
   * costs an upload that never started instead of an episode that reads
   * plausibly and lies.
   *
   * Throwing from here cancels the upload.
   */
  onBoundariesSettled: (startsMs: readonly number[]) => Promise<void>,
): Promise<number[]> {
  const samples = await decode()

  /*
   * Move each seam off the clock and into the nearest gap between words
   * before cutting anything (US-040). A boundary at an arbitrary instant
   * splits a word in two, and a transcriber handed half a word returns a
   * whole one it can pronounce — a word nobody said, entering the counts at
   * every seam.
   *
   * The settled list is both what gets cut and what gets reported, read
   * from the same array, so a stored offset can never describe a different
   * cut from the one that actually happened.
   */
  const settled = settleChunks(
    chunks.map(({ index, startMs, endMs }) => ({ index, startMs, endMs })),
    [...loudnessProfile(samples, SAMPLE_RATE)],
    FRAME_MS,
  ).map((chunk, at) => {
    /*
     * Checked rather than defaulted.
     *
     * This read `chunks[at]?.uploadUrl ?? ''`, which only matters if
     * `settleChunks` returns a different number of chunks than it was given —
     * it maps over its input, so today it cannot. But the failure that
     * allowed is the worst shape available here: a `PUT` to an empty URL,
     * resolving against the page, succeeding or failing somewhere nobody is
     * watching, while every other chunk uploads normally and the episode
     * reports itself finished with a hole in it.
     */
    const uploadUrl = chunks[at]?.uploadUrl
    if (uploadUrl === undefined || uploadUrl.length === 0) {
      throw new Error(`chunk ${chunk.index} has no upload url`)
    }

    return { ...chunk, uploadUrl }
  })

  // Before any bytes go out. See `onBoundariesSettled`.
  await onBoundariesSettled(settled.map((chunk) => chunk.startMs))

  onProgress({ done: 0, total: settled.length })

  // One at a time, on purpose. Several 23 MB uploads at once on a home
  // connection make all of them slow and none of them finish first, and a
  // progress count that moves is worth more here than raw throughput.
  for (const chunk of settled) {
    const from = Math.floor((chunk.startMs / 1000) * SAMPLE_RATE)
    // No clamp needed at the end: `subarray` stops at the last sample. The
    // final chunk's planned end comes from a measured duration and can run
    // a few milliseconds past what actually decoded.
    const to = Math.floor((chunk.endMs / 1000) * SAMPLE_RATE)

    // A Blob rather than the raw bytes: it carries its own content type, so
    // what storage records matches what was actually sent.
    const body = new Blob([encodeWav(samples.subarray(from, to))], { type: CONTENT_TYPE })

    const response = await fetch(chunk.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': CONTENT_TYPE },
      body,
    })

    if (!response.ok) {
      // The status is in the message because the caller has to tell one
      // failure from another: a signed upload URL lasts fifteen minutes,
      // and a 403 on a long episode means it expired mid-upload — worth
      // starting the episode again rather than abandoning the run.
      throw new Error(`chunk ${chunk.index} upload failed: ${response.status}`)
    }

    onProgress({ done: chunk.index + 1, total: settled.length })
  }

  return settled.map((chunk) => chunk.startMs)
}
