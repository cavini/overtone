// US-044 · ADR 0020
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { splitAndUpload, type ChunkTarget } from './split-and-upload.js'
import { SAMPLE_RATE } from './wav.js'

/** What a stubbed upload received, with the WAV unpacked again. */
interface Sent {
  readonly url: string
  readonly method: string
  readonly contentType: string
  readonly samples: Int16Array
}

let sent: Sent[]
let uploadStatus: number
let samples: Float32Array
let decodeCalls: number

/** Keeps its bytes so a test can read back what would have been uploaded. */
class StubBlob {
  readonly bytes: Uint8Array
  constructor(parts: Uint8Array[], readonly options: { type: string }) {
    this.bytes = parts[0] ?? new Uint8Array(0)
  }
}

/** Reads the samples back out of a WAV the code produced. */
const samplesOf = (wav: Uint8Array): Int16Array =>
  new Int16Array(wav.buffer.slice(wav.byteOffset + 44, wav.byteOffset + wav.length))

/**
 * The episode, already decoded.
 *
 * Which decoder produced it is not this function's business any more: the
 * browser has an `AudioContext` and the backfill tool has `ffmpeg`, and the
 * cutting, settling and reporting below them is the same work. See
 * `decode-in-browser.test.ts` for the browser's half.
 */
const decoder = () => {
  decodeCalls += 1
  return Promise.resolve(samples)
}

const target = (index: number, startMs: number, endMs: number): ChunkTarget => ({
  index,
  startMs,
  endMs,
  uploadUrl: `https://storage.example/chunk-${index}?token=t${index}`,
})

/** A ramp, so a test can tell which samples it is looking at. */
const ramp = (length: number, from = 0): Float32Array =>
  Float32Array.from({ length }, (_, index) => (from + index) / 40_000)

beforeEach(() => {
  sent = []
  uploadStatus = 200
  decodeCalls = 0
  samples = new Float32Array(0)

  vi.stubGlobal('Blob', StubBlob)
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    const body = init.body as unknown as StubBlob
    sent.push({
      url,
      method: init.method ?? 'GET',
      contentType: body.options.type,
      samples: samplesOf(body.bytes),
    })
    return Promise.resolve({ ok: uploadStatus < 400, status: uploadStatus })
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/*
 * Where the seams settled. Most of these cases do not care, but the
 * argument is required rather than optional on purpose: the audio is cut on
 * these boundaries, so a caller that forgets to record them would upload
 * bytes the server cannot offset correctly.
 */
const noted = async (): Promise<void> => {}

describe('splitAndUpload', () => {
  it('decodes the episode once, not once per chunk', async () => {
    samples = ramp(SAMPLE_RATE * 4)

    await splitAndUpload(decoder, [target(0, 0, 2000), target(1, 2000, 4000)], () => {}, noted)

    expect(decodeCalls).toBe(1)
    expect(sent).toHaveLength(2)
  })

  /*
   * The arithmetic worth testing. A chunk that starts one sample early or
   * late is not a crash — it is a transcript whose every later timestamp
   * points at the wrong moment, which reads as plausible and is wrong.
   */
  it('sends exactly the samples the chunk covers', async () => {
    samples = ramp(SAMPLE_RATE * 3)

    await splitAndUpload(
      decoder,
      [target(0, 0, 1000), target(1, 1000, 2000), target(2, 2000, 3000)],
      () => {},
      noted,
    )

    for (const [index, upload] of sent.entries()) {
      expect(upload.samples.length).toBe(SAMPLE_RATE)
      // The ramp's value at the chunk's first sample identifies where it was cut.
      const expectedFirst = Math.round(((index * SAMPLE_RATE) / 40_000) * 32_767)
      expect(upload.samples[0]).toBe(expectedFirst)
    }
  })

  it('leaves no gap between one chunk and the next', async () => {
    samples = ramp(SAMPLE_RATE * 2)

    await splitAndUpload(decoder, [target(0, 0, 1000), target(1, 1000, 2000)], () => {}, noted)

    const total = sent.reduce((count, upload) => count + upload.samples.length, 0)
    expect(total).toBe(SAMPLE_RATE * 2)
  })

  // The last chunk's planned end comes from a duration the browser measured,
  // which can run a few milliseconds past the samples that actually decoded.
  it('does not read past the end of the audio', async () => {
    samples = ramp(SAMPLE_RATE)

    await splitAndUpload(decoder, [target(0, 0, 5000)], () => {}, noted)

    expect(sent[0]?.samples.length).toBe(SAMPLE_RATE)
  })

  it('puts each chunk at its own url, as audio/wav', async () => {
    samples = ramp(SAMPLE_RATE * 2)

    await splitAndUpload(decoder, [target(0, 0, 1000), target(1, 1000, 2000)], () => {}, noted)

    expect(sent.map((upload) => upload.method)).toEqual(['PUT', 'PUT'])
    expect(sent.map((upload) => upload.contentType)).toEqual(['audio/wav', 'audio/wav'])
    expect(sent[0]?.url).toContain('chunk-0')
    expect(sent[1]?.url).toContain('chunk-1')
  })

  it('counts up as the chunks go', async () => {
    samples = ramp(SAMPLE_RATE * 2)
    const seen: Array<[number, number]> = []

    await splitAndUpload(
      decoder,
      [target(0, 0, 1000), target(1, 1000, 2000)],
      ({ done, total }) => seen.push([done, total]),
      noted,
    )

    expect(seen).toEqual([[0, 2], [1, 2], [2, 2]])
  })

  // A chunk that silently failed to upload would leave the episode stuck
  // forever, waiting for audio that is not there.
  it('stops and says so when an upload is refused', async () => {
    samples = ramp(SAMPLE_RATE * 2)
    uploadStatus = 403

    await expect(
      splitAndUpload(decoder, [target(0, 0, 1000), target(1, 1000, 2000)], () => {}, noted),
    ).rejects.toThrow(/chunk 0/u)

    expect(sent).toHaveLength(1)
  })

  // The status is in the message because the caller has to tell one failure
  // from another: a signed upload URL expires after fifteen minutes, and a
  // 403 means start the episode again rather than give up on the run.
  it('says which status refused it', async () => {
    samples = ramp(SAMPLE_RATE)
    uploadStatus = 403

    await expect(
      splitAndUpload(decoder, [target(0, 0, 1000)], () => {}, noted),
    ).rejects.toThrow(/403/u)
  })

  it('sends nothing when the audio cannot be decoded', async () => {
    const broken = () => Promise.reject(new Error('not audio'))
    let recorded = false

    await expect(
      splitAndUpload(broken, [target(0, 0, 1000)], () => {}, async () => {
        recorded = true
      }),
    ).rejects.toThrow('not audio')

    expect(sent).toEqual([])
    expect(recorded, 'boundaries recorded for audio that never decoded').toBe(false)
  })

  /*
   * The ordering the whole feature rests on. The audio is cut on the
   * settled boundaries, so an episode whose boundaries were never recorded
   * would be offset by the planned ones instead — every timestamp after a
   * seam wrong, every number still plausible. My first attempt reported
   * them after the upload and swallowed the failure, which is exactly that
   * bug.
   */
  it('records the boundaries before it sends a single byte', async () => {
    samples = ramp(SAMPLE_RATE * 2)
    const order: string[] = []

    await splitAndUpload(
      decoder,
      [target(0, 0, 1000), target(1, 1000, 2000)],
      () => {},
      async () => {
        order.push(`recorded after ${String(sent.length)} uploads`)
      },
    )

    expect(order).toEqual(['recorded after 0 uploads'])
    expect(sent.length).toBeGreaterThan(0)
  })

  it('uploads nothing at all when the boundaries cannot be recorded', async () => {
    samples = ramp(SAMPLE_RATE * 2)

    await expect(
      splitAndUpload(decoder, [target(0, 0, 1000), target(1, 1000, 2000)], () => {}, async () => {
        throw new Error('server said no')
      }),
    ).rejects.toThrow('server said no')

    expect(sent, 'audio went out with no boundaries recorded for it').toEqual([])
  })

  it('reports the boundaries it actually cut on', async () => {
    samples = ramp(SAMPLE_RATE * 2)
    let reported: readonly number[] = []

    const settled = await splitAndUpload(
      decoder,
      [target(0, 0, 1000), target(1, 1000, 2000)],
      () => {},
      async (startsMs) => {
        reported = startsMs
      },
    )

    expect(reported).toEqual(settled)
    expect(settled[0]).toBe(0)
  })
})
