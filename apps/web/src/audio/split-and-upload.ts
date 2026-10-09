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
): Promise<void> {
  const context = new AudioContext({ sampleRate: SAMPLE_RATE })

  let samples: Float32Array
  try {
    samples = toMono(await context.decodeAudioData(await file.arrayBuffer()))
  } finally {
    await context.close()
  }

  onProgress({ done: 0, total: chunks.length })

  // One at a time, on purpose. Several 23 MB uploads at once on a home
  // connection make all of them slow and none of them finish first, and a
  // progress count that moves is worth more here than raw throughput.
  for (const chunk of chunks) {
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

    onProgress({ done: chunk.index + 1, total: chunks.length })
  }
}
