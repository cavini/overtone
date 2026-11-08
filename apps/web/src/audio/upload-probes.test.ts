// US-013
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadProbes, type ProbeTarget } from './upload-probes.js'
import { SAMPLE_RATE } from './wav.js'

interface Sent {
  readonly url: string
  readonly method: string
  readonly contentType: string
  readonly samples: Int16Array
}

let sent: Sent[]
let uploadStatus: number

class StubBlob {
  readonly bytes: Uint8Array
  constructor(parts: Uint8Array[], readonly options: { type: string }) {
    this.bytes = parts[0] ?? new Uint8Array(0)
  }
}

/** Reads the samples back out of a WAV the code produced. */
const samplesOf = (wav: Uint8Array): Int16Array =>
  new Int16Array(wav.buffer.slice(wav.byteOffset + 44, wav.byteOffset + wav.length))

/** A ramp, so a test can tell which stretch of audio it is looking at. */
const ramp = (length: number): Float32Array =>
  Float32Array.from({ length }, (_, index) => index / 40_000)

const target = (index: number, startMs: number, endMs: number): ProbeTarget => ({
  index,
  startMs,
  endMs,
  uploadUrl: `https://storage.example/probe-${index}?token=t${index}`,
})

beforeEach(() => {
  sent = []
  uploadStatus = 200

  vi.stubGlobal('Blob', StubBlob)
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      const body = init.body as unknown as StubBlob
      sent.push({
        url,
        method: init.method ?? 'GET',
        contentType: body.options.type,
        samples: samplesOf(body.bytes),
      })
      return Promise.resolve({ ok: uploadStatus < 400, status: uploadStatus })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('uploadProbes', () => {
  it('sends one piece of audio per probe', async () => {
    await uploadProbes(ramp(SAMPLE_RATE * 10), [target(0, 1000, 2000), target(1, 5000, 6000)])

    expect(sent).toHaveLength(2)
    expect(sent[0]?.url).toContain('probe-0')
    expect(sent[1]?.url).toContain('probe-1')
  })

  /*
   * The arithmetic worth testing, for the same reason the chunk cutting is
   * tested: a window taken from the wrong offset is not a crash. It is a
   * language decided from audio nobody chose to listen to — and in this
   * case, from the intro, which is the one stretch that answers English for
   * every episode this group records.
   */
  it('cuts each window at the offset it was asked for', async () => {
    await uploadProbes(ramp(SAMPLE_RATE * 10), [target(0, 2000, 3000)])

    const cut = sent[0]?.samples
    expect(cut).toHaveLength(SAMPLE_RATE)

    // The first sample of the window is the one two seconds into the ramp.
    const expectedFirst = Math.round(((2 * SAMPLE_RATE) / 40_000) * 32767)
    expect(cut?.[0]).toBe(expectedFirst)
  })

  it('sends real audio files, typed as what they are', async () => {
    await uploadProbes(ramp(SAMPLE_RATE * 10), [target(0, 1000, 2000)])

    expect(sent[0]?.method).toBe('PUT')
    expect(sent[0]?.contentType).toBe('audio/wav')
  })

  // A probe that never arrived cannot be transcribed, and a detection run
  // on fewer windows than were planned is a weaker vote than it reports.
  // Better to fail the upload than to quietly decide on one window.
  it('fails loudly when a probe will not upload', async () => {
    uploadStatus = 403

    await expect(uploadProbes(ramp(SAMPLE_RATE * 10), [target(0, 1000, 2000)])).rejects.toThrow(
      /403/u,
    )
  })

  it('has nothing to send when no probe was planned', async () => {
    await uploadProbes(ramp(SAMPLE_RATE), [])

    expect(sent).toHaveLength(0)
  })
})
