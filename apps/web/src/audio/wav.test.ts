// US-044 · ADR 0020
import { describe, expect, it } from 'vitest'
import { CHUNK_TARGET_MS } from '@overtone/core'
import { BYTES_PER_SECOND, CHUNK_SECONDS, encodeWav, SAMPLE_RATE } from './wav.js'

const read = (bytes: Uint8Array, at: number, length: number): string =>
  String.fromCharCode(...bytes.slice(at, at + length))

const u32 = (bytes: Uint8Array, at: number): number =>
  new DataView(bytes.buffer, bytes.byteOffset).getUint32(at, true)

const u16 = (bytes: Uint8Array, at: number): number =>
  new DataView(bytes.buffer, bytes.byteOffset).getUint16(at, true)

describe('encodeWav', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1, -1])

  it('writes a RIFF/WAVE header', () => {
    const wav = encodeWav(samples)

    expect(read(wav, 0, 4)).toBe('RIFF')
    expect(read(wav, 8, 8)).toBe('WAVEfmt ')
    expect(read(wav, 36, 4)).toBe('data')
  })

  // What Whisper wants anyway: it downsamples everything to 16 kHz mono, so
  // sending more is bytes nobody listens to.
  it('is 16 kHz, mono, 16-bit', () => {
    const wav = encodeWav(samples)

    expect(u16(wav, 20)).toBe(1) // PCM
    expect(u16(wav, 22)).toBe(1) // channels
    expect(u32(wav, 24)).toBe(SAMPLE_RATE)
    expect(u16(wav, 34)).toBe(16) // bits per sample
  })

  it('states the sizes the header promises', () => {
    const wav = encodeWav(samples)

    expect(u32(wav, 4)).toBe(wav.length - 8)
    expect(u32(wav, 40)).toBe(samples.length * 2)
    expect(wav.length).toBe(44 + samples.length * 2)
  })

  it('converts the full-scale samples to the full-scale integers', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1]))
    const view = new DataView(wav.buffer, wav.byteOffset)

    expect(view.getInt16(44, true)).toBe(0)
    expect(view.getInt16(46, true)).toBe(32767)
    expect(view.getInt16(48, true)).toBe(-32768)
  })

  // A sample over 1.0 wrapping to a large negative number is an audible
  // click, and the transcriber hears it as a consonant that was never said.
  it('clips rather than wrapping when a sample is out of range', () => {
    const wav = encodeWav(new Float32Array([2, -2, 99]))
    const view = new DataView(wav.buffer, wav.byteOffset)

    expect(view.getInt16(44, true)).toBe(32767)
    expect(view.getInt16(46, true)).toBe(-32768)
    expect(view.getInt16(48, true)).toBe(32767)
  })

  it('copes with no samples at all', () => {
    expect(encodeWav(new Float32Array(0)).length).toBe(44)
  })
})

describe('the chunk size', () => {
  // Groq refuses a file over 25 MB. Uncompressed 16 kHz mono 16-bit runs at
  // a known rate, so the longest safe chunk is arithmetic, not a guess.
  it('keeps a full chunk under the 25 MB file cap', () => {
    const bytes = 44 + CHUNK_SECONDS * BYTES_PER_SECOND

    expect(bytes).toBeLessThan(25 * 1024 * 1024)
  })

  it('leaves real headroom, not a rounding error', () => {
    const bytes = 44 + CHUNK_SECONDS * BYTES_PER_SECOND

    expect(bytes).toBeLessThan(24 * 1024 * 1024)
  })

  // The other ceiling: a single chunk must never be refused for its duration
  // against the hourly balance of 7 200 audio-seconds.
  it('is far inside one hour of allowance', () => {
    expect(CHUNK_SECONDS).toBeLessThan(7_200 / 4)
  })

  /*
   * Each chunk is a round trip and a stitching seam, so the count is worth
   * watching — but the bound here was a bare 12, which is just the number
   * the target happened to give. Lowering the target to ten minutes to make
   * room for seam-moving (US-040) took a 2 h 06 m episode from eleven
   * chunks to thirteen and failed this for no reason worth having.
   *
   * Stated against the limit that actually binds: the free tier allows
   * 2 000 requests a day and the group gets three episodes out of the
   * audio-second allowance, so the ceiling is nowhere near.
   */
  it('splits a real two-hour episode into far fewer pieces than a day allows', () => {
    const chunks = Math.ceil(7_591 / CHUNK_SECONDS)

    expect(chunks).toBeGreaterThan(1)
    expect(chunks * 3, 'three episodes of requests in a day').toBeLessThan(2_000)
  })

  it('states the byte rate it is doing the arithmetic with', () => {
    expect(BYTES_PER_SECOND).toBe(SAMPLE_RATE * 2)
  })

  // The splitter and the planner must cut at exactly the same places, or a
  // chunk the browser uploaded is not the chunk the server asks the
  // transcriber for, and every timestamp after the first seam is wrong.
  it('cuts where the domain says to cut', () => {
    expect(CHUNK_SECONDS * 1_000).toBe(CHUNK_TARGET_MS)
  })
})
