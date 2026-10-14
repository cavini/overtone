// US-044 · ADR 0020
//
// The browser's half of the split. Everything else about cutting an episode
// up — moving the seams into the gaps, reporting where they landed, sending
// each piece — runs anywhere Node runs; `decodeAudioData` is the single
// reason the old version of this could only run in a tab. These cases are
// the ones that were testing the decoder rather than the splitter.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeInBrowser } from './decode-in-browser.js'
import { SAMPLE_RATE } from './wav.js'

let decoded: { numberOfChannels: number; length: number; channels: Float32Array[] }
let contextsClosed: number
let requestedRates: number[]

class StubAudioContext {
  constructor(readonly options: { sampleRate: number }) {
    requestedRates.push(options.sampleRate)
  }
  decodeAudioData(): Promise<unknown> {
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

const fileOf = (): File =>
  ({ name: 'episode.mp3', arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }) as unknown as File

beforeEach(() => {
  contextsClosed = 0
  requestedRates = []
  decoded = { numberOfChannels: 1, length: 2, channels: [new Float32Array([0.25, -0.25])] }

  vi.stubGlobal('AudioContext', StubAudioContext)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('decodeInBrowser', () => {
  // Decoded straight to the rate that will be sent. Decoding at 48 kHz and
  // resampling later is six times the memory for samples nobody sends — and
  // a two-hour episode is already hundreds of megabytes.
  it('decodes straight to the rate that will be sent', async () => {
    await decodeInBrowser(fileOf())

    expect(requestedRates).toEqual([SAMPLE_RATE])
  })

  it('hands back the samples it decoded', async () => {
    expect([...(await decodeInBrowser(fileOf()))]).toEqual([0.25, -0.25])
  })

  // A podcast edit can easily put one voice on one side. Taking only the
  // left channel would lose a host.
  it('averages the channels rather than taking one', async () => {
    decoded = {
      numberOfChannels: 2,
      length: 4,
      channels: [new Float32Array([1, 1, 1, 1]), new Float32Array([-1, -1, -1, -1])],
    }

    // +1 and −1 average to silence; taking the left would give full scale.
    expect([...(await decodeInBrowser(fileOf()))].every((sample) => sample === 0)).toBe(true)
  })

  it('closes the audio context when it is done', async () => {
    await decodeInBrowser(fileOf())

    expect(contextsClosed).toBe(1)
  })

  // A tab may only have a handful of audio contexts at once, so one leaked
  // per refused file is a page that stops being able to decode at all.
  it('closes the audio context even when decoding throws', async () => {
    vi.stubGlobal('AudioContext', class extends StubAudioContext {
      override decodeAudioData(): Promise<unknown> {
        return Promise.reject(new Error('not audio'))
      }
    })

    await expect(decodeInBrowser(fileOf())).rejects.toThrow('not audio')
    expect(contextsClosed).toBe(1)
  })
})
