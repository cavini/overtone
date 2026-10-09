import { CHUNK_TARGET_MS } from '@overtone/core'

/**
 * Uncompressed 16 kHz mono audio, which is all the transcriber wants.
 *
 * Whisper downsamples everything to 16 kHz mono before it does anything, so
 * sending more is bytes nobody listens to. WAV rather than Opus because a
 * WAV is a 44-byte header in front of the samples — no encoder, no container
 * format, no library, and nothing to get subtly wrong at a chunk boundary.
 *
 * The cost is size: uncompressed runs at 32 KB a second, so a two-hour
 * episode is a few hundred megabytes uploaded rather than about twenty.
 * That is a real cost and the obvious thing to improve later; it is not a
 * reason to ship nothing.
 */

/** What Whisper resamples to anyway. */
export const SAMPLE_RATE = 16_000

/** Mono, 16-bit: two bytes a sample. */
export const BYTES_PER_SECOND = SAMPLE_RATE * 2

/**
 * How long one chunk is, in seconds.
 *
 * Taken from the domain rather than restated here: the planner on the server
 * and the splitter in the browser have to agree exactly, and two constants
 * that must match are two constants that will eventually not. The test
 * beside this one is what checks the duration core chose still fits the byte
 * budget above.
 */
export const CHUNK_SECONDS = CHUNK_TARGET_MS / 1_000

const HEADER_BYTES = 44

/**
 * Turns one chunk of samples into a file the transcriber will accept.
 *
 * The return type names the buffer it owns, rather than the wider
 * `ArrayBufferLike`. Without that a browser will not take the result as a
 * request body — it cannot know the bytes are not a view onto a
 * `SharedArrayBuffer`, which is not allowed to cross a network boundary.
 */
export function encodeWav(samples: Float32Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(HEADER_BYTES + samples.length * 2)
  const view = new DataView(bytes.buffer)

  const ascii = (at: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(at + index, text.charCodeAt(index))
    }
  }

  ascii(0, 'RIFF')
  view.setUint32(4, bytes.length - 8, true)
  ascii(8, 'WAVEfmt ')
  view.setUint32(16, 16, true) // the fmt chunk's own length
  view.setUint16(20, 1, true) // PCM, uncompressed
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, BYTES_PER_SECOND, true)
  view.setUint16(32, 2, true) // bytes per frame
  view.setUint16(34, 16, true) // bits per sample
  ascii(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  for (let index = 0; index < samples.length; index += 1) {
    // Clipped, not wrapped. A sample above 1.0 wrapping to a large negative
    // number is an audible click, and the transcriber hears a consonant
    // nobody said.
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0))
    view.setInt16(HEADER_BYTES + index * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true)
  }

  return bytes
}
