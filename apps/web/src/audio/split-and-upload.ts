import { settleChunks } from '@overtone/core'
import { FRAME_MS, loudnessProfile } from './loudness.js'
import { encodeWav, SAMPLE_RATE } from './wav.js'

/**
 * Cuts the episode up and sends the pieces straight to storage.
 *
 * This is the only path the audio takes. It does not go through the server:
 * a serverless function accepts about 4.5 MB of body and an episode is a
 * hundred times that, so the browser uploads to a signed URL per chunk and
 * the server never holds a byte of it.
 *
 * Cutting here rather than there is also the only way it can be cut at all.
 * The pieces have to be real audio files — the transcriber fetches each one
 * on its own — and you cannot make one by taking a byte range out of an MP3.
 * Decoding, slicing samples and re-encoding is what produces a file rather
 * than a fragment.
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

const CONTENT_TYPE = 'audio/wav'

/**
 * Everything mixed down to one channel.
 *
 * Whisper is mono, and averaging here rather than sending both halves is
 * what keeps a chunk inside the file cap. Averaging — not just taking the
 * left — because a podcast edit can easily put one voice on one side.
 */
function toMono(decoded: AudioBuffer): Float32Array {
  if (decoded.numberOfChannels === 1) return decoded.getChannelData(0)

  const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) =>
    decoded.getChannelData(index),
  )
  const mixed = new Float32Array(decoded.length)

  for (let sample = 0; sample < mixed.length; sample += 1) {
    let total = 0
    for (const channel of channels) total += channel[sample] ?? 0
    mixed[sample] = total / channels.length
  }

  return mixed
}

/**
 * Decodes the file once, then uploads each chunk in turn.
 *
 * Decoded at 16 kHz on the way in, so the samples held in memory are the
 * ones that will be sent rather than six times as many at CD rate.
 */
export async function splitAndUpload(
  file: File,
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
  const context = new AudioContext({ sampleRate: SAMPLE_RATE })

  let samples: Float32Array
  try {
    samples = toMono(await context.decodeAudioData(await file.arrayBuffer()))
  } finally {
    await context.close()
  }

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
  ).map((chunk, at) => ({ ...chunk, uploadUrl: chunks[at]?.uploadUrl ?? '' }))

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
      throw new Error(`chunk ${chunk.index} upload failed: ${response.status}`)
    }

    onProgress({ done: chunk.index + 1, total: settled.length })
  }

  return settled.map((chunk) => chunk.startMs)
}
