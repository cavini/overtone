/**
 * How long the audio is, measured in the browser.
 *
 * The chunk plan needs the duration *before* anything is sent (ADR 0020) and
 * the server would have to decode the file to learn it. The browser already
 * has a decoder, so it answers.
 *
 * Two ways, in order of cost:
 *
 * 1. An `<audio>` element reading just the metadata. Cheap — it does not
 *    decode the audio, only the container header — so it is right for a
 *    two-hour file.
 * 2. `decodeAudioData`, which decodes the lot. Reliable where the first is
 *    not: media element loading can be blocked outright by a browser or an
 *    embedded webview, and when it is, the element never fires an event at
 *    all. Observed in practice, which is why this exists.
 *
 * The second costs memory proportional to the audio's length, so it runs at
 * the lowest sample rate browsers allow — the duration is the same whatever
 * rate it is decoded at, and nothing here keeps the samples.
 */

/**
 * Short on purpose.
 *
 * Reading a container header is near-instant even for a two-hour file — it
 * is a seek, not a decode. A few seconds of silence means the element is not
 * going to answer at all, and waiting longer only delays the fallback that
 * will actually work.
 */
const METADATA_TIMEOUT_MS = 4_000
const DECODE_TIMEOUT_MS = 60_000

/** The lowest Chrome and Safari accept. Six times less memory than 48 kHz. */
const LOW_RATE_HZ = 8_000

export class DurationUnknownError extends Error {
  constructor() {
    super('could not measure the audio duration')
    this.name = 'DurationUnknownError'
  }
}

const withTimeout = <T,>(work: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    work,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new DurationUnknownError()), ms)
    }),
  ])

/** The cheap way: the container's own header, no decoding. */
function fromMediaElement(blob: Blob): Promise<number> {
  return withTimeout(
    new Promise<number>((resolve, reject) => {
      const url = URL.createObjectURL(blob)
      const probe = new Audio()
      let settled = false

      const finish = (outcome: () => void) => {
        if (settled) return
        settled = true
        URL.revokeObjectURL(url)
        probe.removeAttribute('src')
        outcome()
      }

      probe.addEventListener('loadedmetadata', () => {
        const seconds = probe.duration
        finish(() =>
          Number.isFinite(seconds) && seconds > 0
            ? resolve(Math.round(seconds * 1000))
            : reject(new DurationUnknownError()),
        )
      })
      probe.addEventListener('error', () => finish(() => reject(new DurationUnknownError())))

      probe.preload = 'metadata'
      probe.src = url
    }),
    METADATA_TIMEOUT_MS,
  )
}

/** The reliable way: decode it and read the length off the buffer. */
async function fromWebAudio(bytes: ArrayBuffer): Promise<number> {
  const context = new AudioContext({ sampleRate: LOW_RATE_HZ })
  try {
    // `decodeAudioData` detaches the buffer it is given, so it gets a copy —
    // otherwise a later retry would find it empty.
    const decoded = await withTimeout(context.decodeAudioData(bytes.slice(0)), DECODE_TIMEOUT_MS)
    if (!Number.isFinite(decoded.duration) || decoded.duration <= 0) {
      throw new DurationUnknownError()
    }
    return Math.round(decoded.duration * 1000)
  } finally {
    await context.close()
  }
}

/**
 * Measures the audio, or throws `DurationUnknownError`.
 *
 * Throws rather than guessing. Pacing without a real duration is what sent a
 * whole two-hour episode as one request and had it refused (ADR 0020), and a
 * wrong guess fails later, further away, and more expensively.
 */
export async function measureDuration(file: File, contentType: string): Promise<number> {
  // Re-typed on the way in: a file picked from disk often arrives as
  // `application/octet-stream`, and a browser will not decode a blob whose
  // type it cannot place.
  const typed = new Blob([file], { type: contentType })

  try {
    return await fromMediaElement(typed)
  } catch {
    return await fromWebAudio(await file.arrayBuffer())
  }
}
