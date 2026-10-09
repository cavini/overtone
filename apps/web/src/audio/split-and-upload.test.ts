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
let decoded: { numberOfChannels: number; length: number; channels: Float32Array[] }
let contextsClosed: number
let decodeCalls: number

/** Keeps its bytes so a test can read back what would have been uploaded. */
class StubBlob {
  readonly bytes: Uint8Array
  constructor(parts: Uint8Array[], readonly options: { type: string }) {
    this.bytes = parts[0] ?? new Uint8Array(0)
  }
}

let requestedRates: number[]

class StubAudioContext {
  constructor(readonly options: { sampleRate: number }) {
    requestedRates.push(options.sampleRate)
  }
  decodeAudioData(): Promise<unknown> {
    decodeCalls += 1
    return Promise.resolve({
      numberOfChannels: decoded.numberOfChannels,
      length: decoded.length,
      getChannelData: (index: number) => decoded.channels[index],
    })
  }
  close(): Promise<void> {
    contextsClosed += 1
    return Promise.resolve()
  }
}

/** Reads the samples back out of a WAV the code produced. */
const samplesOf = (wav: Uint8Array): Int16Array =>
  new Int16Array(wav.buffer.slice(wav.byteOffset + 44, wav.byteOffset + wav.length))

const fileOf = (): File =>
  ({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }) as unknown as File

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
  contextsClosed = 0
  decodeCalls = 0
  requestedRates = []
  decoded = { numberOfChannels: 1, length: 0, channels: [new Float32Array(0)] }

  vi.stubGlobal('AudioContext', StubAudioContext)
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

describe('splitAndUpload', () => {
  it('decodes the file once, not once per chunk', async () => {
    decoded = { numberOfChannels: 1, length: SAMPLE_RATE * 4, channels: [ramp(SAMPLE_RATE * 4)] }

    await splitAndUpload(fileOf(), [target(0, 0, 2000), target(1, 2000, 4000)], () => {})

    expect(decodeCalls).toBe(1)
    expect(sent).toHaveLength(2)
  })

  it('decodes straight to the rate that will be sent', async () => {
    decoded = { numberOfChannels: 1, length: SAMPLE_RATE, channels: [ramp(SAMPLE_RATE)] }

    await splitAndUpload(fileOf(), [target(0, 0, 1000)], () => {})

    // Decoded straight to the rate that will be sent. Decoding at 48 kHz
    // and resampling later is six times the memory for samples nobody
    // sends — and a two-hour episode is already hundreds of megabytes.
    expect(requestedRates).toEqual([SAMPLE_RATE])
    expect(sent[0]?.samples.length).toBe(SAMPLE_RATE)
  })

  /*
   * The arithmetic worth testing. A chunk that starts one sample early or
   * late is not a crash — it is a transcript whose every later timestamp
   * points at the wrong moment, which reads as plausible and is wrong.
   */
  it('sends exactly the samples the chunk covers', async () => {
    decoded = { numberOfChannels: 1, length: SAMPLE_RATE * 3, channels: [ramp(SAMPLE_RATE * 3)] }

    await splitAndUpload(
      fileOf(),
      [target(0, 0, 1000), target(1, 1000, 2000), target(2, 2000, 3000)],
      () => {},
    )

    for (const [index, upload] of sent.entries()) {
      expect(upload.samples.length).toBe(SAMPLE_RATE)
      // The ramp's value at the chunk's first sample identifies where it was cut.
      const expectedFirst = Math.round(((index * SAMPLE_RATE) / 40_000) * 32_767)
      expect(upload.samples[0]).toBe(expectedFirst)
    }
  })

  it('leaves no gap between one chunk and the next', async () => {
    decoded = { numberOfChannels: 1, length: SAMPLE_RATE * 2, channels: [ramp(SAMPLE_RATE * 2)] }

    await splitAndUpload(fileOf(), [target(0, 0, 1000), target(1, 1000, 2000)], () => {})

    const total = sent.reduce((count, upload) => count + upload.samples.length, 0)
    expect(total).toBe(SAMPLE_RATE * 2)
  })

  // The last chunk's planned end comes from a duration the browser measured,
  // which can run a few milliseconds past the samples that actually decoded.
  it('does not read past the end of the audio', async () => {
    decoded = { numberOfChannels: 1, length: SAMPLE_RATE, channels: [ramp(SAMPLE_RATE)] }

    await splitAndUpload(fileOf(), [target(0, 0, 5000)], () => {})

    expect(sent[0]?.samples.length).toBe(SAMPLE_RATE)
  })

  // A podcast edit can easily put one voice on one side. Taking only the
  // left channel would lose a host.
  it('averages the channels rather than taking one', async () => {
    decoded = {
      numberOfChannels: 2,
      length: 4,
      channels: [new Float32Array([1, 1, 1, 1]), new Float32Array([-1, -1, -1, -1])],
    }

    await splitAndUpload(fileOf(), [target(0, 0, 1)], () => {})

    // +1 and −1 average to silence; taking the left would give full scale.
    expect([...(sent[0]?.samples ?? [])].every((sample) => sample === 0)).toBe(true)
  })

  it('puts each chunk at its own url, as audio/wav', async () => {
    decoded = { numberOfChannels: 1, length: SAMPLE_RATE * 2, channels: [ramp(SAMPLE_RATE * 2)] }

    await splitAndUpload(fileOf(), [target(0, 0, 1000), target(1, 1000, 2000)], () => {})

    expect(sent.map((upload) => upload.method)).toEqual(['PUT', 'PUT'])
    expect(sent.map((upload) => upload.contentType)).toEqual(['audio/wav', 'audio/wav'])
    expect(sent[0]?.url).toContain('chunk-0')
    expect(sent[1]?.url).toContain('chunk-1')
  })

  it('counts up as the chunks go', async () => {
    decoded = { numberOfChannels: 1, length: SAMPLE_RATE * 2, channels: [ramp(SAMPLE_RATE * 2)] }
    const seen: Array<[number, number]> = []

    await splitAndUpload(
      fileOf(),
      [target(0, 0, 1000), target(1, 1000, 2000)],
      ({ done, total }) => seen.push([done, total]),
    )

    expect(seen).toEqual([[0, 2], [1, 2], [2, 2]])
  })

  // A chunk that silently failed to upload would leave the episode stuck
  // forever, waiting for audio that is not there.
  it('stops and says so when an upload is refused', async () => {
    decoded = { numberOfChannels: 1, length: SAMPLE_RATE * 2, channels: [ramp(SAMPLE_RATE * 2)] }
    uploadStatus = 403

    await expect(
      splitAndUpload(fileOf(), [target(0, 0, 1000), target(1, 1000, 2000)], () => {}),
    ).rejects.toThrow(/chunk 0/u)

    expect(sent).toHaveLength(1)
  })

  it('closes the audio context even when decoding throws', async () => {
    vi.stubGlobal('AudioContext', class extends StubAudioContext {
      override decodeAudioData(): Promise<unknown> {
        return Promise.reject(new Error('not audio'))
      }
    })

    await expect(splitAndUpload(fileOf(), [target(0, 0, 1000)], () => {})).rejects.toThrow()
    expect(contextsClosed).toBe(1)
  })
})
