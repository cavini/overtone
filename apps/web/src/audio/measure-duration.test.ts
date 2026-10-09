// US-042 · ADR 0020
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DurationUnknownError, measureDuration } from './measure-duration.js'

/**
 * The browser APIs this module is made of, stubbed.
 *
 * Both paths are real browser behaviour that cannot be exercised in node, but
 * the thing worth pinning is not the decoding — it is which path runs when,
 * and that a blocked media element leads to an answer rather than a hang.
 */
type ElementBehaviour = 'metadata' | 'error' | 'silent' | 'zero'

let behaviour: ElementBehaviour
let decode: () => Promise<{ duration: number }>
let created: { audios: number; contexts: number; closed: number; rates: number[] }

class StubAudio {
  private readonly listeners = new Map<string, () => void>()
  duration = 0
  preload = ''

  constructor() {
    created.audios += 1
  }

  addEventListener(event: string, handler: () => void): void {
    this.listeners.set(event, handler)
  }

  removeAttribute(): void {}

  set src(_value: string) {
    // The element answers on its own schedule; a real one is asynchronous.
    queueMicrotask(() => {
      if (behaviour === 'metadata') {
        this.duration = 42.4
        this.listeners.get('loadedmetadata')?.()
      } else if (behaviour === 'zero') {
        this.duration = 0
        this.listeners.get('loadedmetadata')?.()
      } else if (behaviour === 'error') {
        this.listeners.get('error')?.()
      }
      // 'silent' does nothing at all, which is what a blocked element does.
    })
  }
}

class StubAudioContext {
  constructor(options: { sampleRate: number }) {
    created.contexts += 1
    created.rates.push(options.sampleRate)
  }
  decodeAudioData(): Promise<{ duration: number }> {
    return decode()
  }
  close(): Promise<void> {
    created.closed += 1
    return Promise.resolve()
  }
}

const fileOf = (bytes = 8): File =>
  ({
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(bytes)),
  }) as unknown as File

beforeEach(() => {
  vi.useFakeTimers()
  behaviour = 'metadata'
  decode = () => Promise.resolve({ duration: 900 })
  created = { audios: 0, contexts: 0, closed: 0, rates: [] }

  vi.stubGlobal('Audio', StubAudio)
  vi.stubGlobal('AudioContext', StubAudioContext)
  vi.stubGlobal('Blob', class {})
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:stub', revokeObjectURL: () => {} })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('measureDuration', () => {
  it('reads the container header when it can', async () => {
    const measured = measureDuration(fileOf(), 'audio/mp4')

    await expect(measured).resolves.toBe(42_400)
    // Cheap path only: nothing was decoded.
    expect(created.contexts).toBe(0)
  })

  // The expensive path must not run when the cheap one works, because it
  // decodes the whole episode and a two-hour file is a lot of memory.
  it('does not decode when the header answered', async () => {
    await measureDuration(fileOf(), 'audio/mp4')
    expect(created.contexts).toBe(0)
  })

  it('decodes when the element reports an error', async () => {
    behaviour = 'error'

    await expect(measureDuration(fileOf(), 'audio/mp4')).resolves.toBe(900_000)
    expect(created.contexts).toBe(1)
  })

  /*
   * The case that cost an afternoon. A browser or an embedded webview can
   * block media element loading outright, and the element then fires nothing
   * at all — no `loadedmetadata`, no `error`. Without the timeout the upload
   * sits on "sending" forever with nothing to show for it.
   */
  it('decodes when the element never answers at all', async () => {
    behaviour = 'silent'

    const measured = measureDuration(fileOf(), 'audio/mp4')
    await vi.advanceTimersByTimeAsync(4_000)

    await expect(measured).resolves.toBe(900_000)
  })

  it('does not wait long before giving up on the element', async () => {
    behaviour = 'silent'

    const measured = measureDuration(fileOf(), 'audio/mp4')
    await vi.advanceTimersByTimeAsync(5_000)

    await expect(measured).resolves.toBe(900_000)
  })

  // A duration of zero is not a duration. Reporting it would plan zero
  // chunks and silently analyse nothing.
  it('treats a zero-length answer as no answer', async () => {
    behaviour = 'zero'

    await expect(measureDuration(fileOf(), 'audio/mp4')).resolves.toBe(900_000)
  })

  // Decoding at a low rate costs a fraction of the memory, and the duration
  // is the same whatever rate it was decoded at.
  it('decodes at a low sample rate', async () => {
    behaviour = 'error'

    await measureDuration(fileOf(), 'audio/mp4')

    expect(created.rates).toEqual([8_000])
  })

  it('always closes the context it opened', async () => {
    behaviour = 'error'
    decode = () => Promise.reject(new Error('codec missing'))

    await expect(measureDuration(fileOf(), 'audio/mp4')).rejects.toThrow()
    expect(created.closed).toBe(1)
  })

  // Throws rather than guessing. Pacing on a wrong duration is what sent a
  // whole two-hour episode as one request and had it refused (ADR 0020).
  it('refuses to guess when neither way works', async () => {
    behaviour = 'error'
    decode = () => Promise.resolve({ duration: 0 })

    await expect(measureDuration(fileOf(), 'audio/mp4')).rejects.toThrow(DurationUnknownError)
  })

  it('gives up on a decode that never finishes', async () => {
    behaviour = 'error'
    decode = () => new Promise(() => {})

    const measured = measureDuration(fileOf(), 'audio/mp4')
    const settled = expect(measured).rejects.toThrow(DurationUnknownError)
    await vi.advanceTimersByTimeAsync(60_000)

    await settled
  })
})
