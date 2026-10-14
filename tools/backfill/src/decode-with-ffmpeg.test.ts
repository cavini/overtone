// Decoding without a browser.
//
// The tab decodes with `AudioContext`; out here there is ffmpeg, which is
// the one thing this tool needs that does not come with Node. These tests
// never start a process: the decoder takes the way of starting one as an
// argument, which is also how the "it is not installed" path can be
// asserted on a machine where it *is* installed, and the other way round.
import { describe, expect, it } from 'vitest'
import { decodeWithFfmpeg, FFMPEG_MISSING, requireFfmpeg } from './decode-with-ffmpeg.js'
import type { Program, ProgramEnd, StartProgram } from './spawn-program.js'

interface Started {
  readonly command: string
  readonly args: readonly string[]
}

/** A program that says what it was told to be, and nothing else. */
const stub = (
  parts: readonly Uint8Array[],
  end: ProgramEnd | Error,
): { start: StartProgram; started: Started[] } => {
  const started: Started[] = []

  const start: StartProgram = (command, args): Program => {
    started.push({ command, args })

    return {
      stdout: (async function* () {
        for (const part of parts) yield part
      })(),
      done: end instanceof Error ? Promise.reject(end) : Promise.resolve(end),
    }
  }

  return { start, started }
}

const ok: ProgramEnd = { code: 0, stderr: '' }

/** Little-endian 32-bit floats, which is what `f32le` means. */
const f32le = (...samples: readonly number[]): Uint8Array => {
  const bytes = new Uint8Array(samples.length * 4)
  const view = new DataView(bytes.buffer)
  samples.forEach((sample, at) => view.setFloat32(at * 4, sample, true))

  return bytes
}

const notInstalled = (): Error =>
  Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' })

describe('decodeWithFfmpeg', () => {
  it('asks for raw mono samples at the rate that will be sent', async () => {
    const { start, started } = stub([f32le(0)], ok)

    await decodeWithFfmpeg('/tmp/chuva-de-canivetes-001.mp3', start)

    expect(started[0]?.command).toBe('ffmpeg')
    const args = started[0]?.args.join(' ') ?? ''
    expect(args).toContain('-i /tmp/chuva-de-canivetes-001.mp3')
    // Mono at 16 kHz, 32-bit float, no container: the same samples
    // `decodeAudioData` hands the browser.
    expect(args).toContain('-ac 1')
    expect(args).toContain('-ar 16000')
    expect(args).toContain('-f f32le')
  })

  it('hands back the samples ffmpeg wrote', async () => {
    const { start } = stub([f32le(0.5, -0.25, 0.125)], ok)

    expect([...(await decodeWithFfmpeg('/tmp/x.mp3', start))]).toEqual([0.5, -0.25, 0.125])
  })

  /*
   * A pipe hands over whatever has arrived, so a four-byte sample is
   * regularly split down the middle between two reads. Converting each read
   * on its own would turn every such sample into noise — a click the
   * transcriber hears as a consonant.
   */
  it('does not mind a sample arriving in two pieces', async () => {
    const whole = f32le(0.5, -0.25)
    const { start } = stub([whole.slice(0, 2), whole.slice(2, 7), whole.slice(7)], ok)

    expect([...(await decodeWithFfmpeg('/tmp/x.mp3', start))]).toEqual([0.5, -0.25])
  })

  // A trailing part-sample is not a sample. Reading it as one would put a
  // garbage value at the end of the episode.
  it('ignores bytes that do not make up a whole sample', async () => {
    const { start } = stub([new Uint8Array([...f32le(0.5), 1, 2, 3])], ok)

    expect([...(await decodeWithFfmpeg('/tmp/x.mp3', start))]).toEqual([0.5])
  })

  /*
   * The message that matters most, because it is the one everybody will see
   * first: ffmpeg is not installed by this repo and is not a dependency
   * anything else here needs.
   */
  it('says how to install ffmpeg when it is not there', async () => {
    const { start } = stub([], notInstalled())

    await expect(decodeWithFfmpeg('/tmp/x.mp3', start)).rejects.toThrow(FFMPEG_MISSING)
  })

  it('names the file and repeats what ffmpeg complained about', async () => {
    const { start } = stub([], { code: 1, stderr: 'x.mp3: Invalid data found when processing input' })

    await expect(decodeWithFfmpeg('/tmp/x.mp3', start)).rejects.toThrow(/Invalid data/u)
    await expect(decodeWithFfmpeg('/tmp/x.mp3', start)).rejects.toThrow(/x\.mp3/u)
  })

  // A decoder that answered with no samples would be taken for a
  // zero-length episode, which `/api/episodes/start` refuses as unreadable
  // audio — a confusing way to learn that ffmpeg produced nothing.
  it('will not pass off an empty decode as an episode', async () => {
    const { start } = stub([], ok)

    await expect(decodeWithFfmpeg('/tmp/x.mp3', start)).rejects.toThrow(/no audio/u)
  })
})

describe('requireFfmpeg', () => {
  /*
   * Checked before anything is downloaded. Learning that ffmpeg is missing
   * after pulling a hundred megabytes over somebody's connection is a worse
   * way to find out.
   */
  it('is happy when ffmpeg answers', async () => {
    const { start, started } = stub([], ok)

    await requireFfmpeg(start)

    expect(started[0]?.args).toContain('-version')
  })

  it('says how to install it when it is not there', async () => {
    const { start } = stub([], notInstalled())

    await expect(requireFfmpeg(start)).rejects.toThrow(FFMPEG_MISSING)
  })

  it('says so when ffmpeg is there but broken', async () => {
    const { start } = stub([], { code: 127, stderr: 'dyld: library not loaded' })

    await expect(requireFfmpeg(start)).rejects.toThrow(/library not loaded/u)
  })
})

describe('a failure that is not a missing ffmpeg', () => {
  /*
   * Only ENOENT becomes installation advice. Anything else — a permission
   * denied, a binary that is not executable — must come through as itself,
   * or every failure to start a process reads as "install ffmpeg" and
   * whoever is debugging installs it twice.
   */
  it('comes through as itself', async () => {
    const { start } = stub([], Object.assign(new Error('EACCES: permission denied'), {
      code: 'EACCES',
    }))

    await expect(decodeWithFfmpeg('/tmp/x.mp3', start)).rejects.toThrow(/permission denied/u)
    await expect(decodeWithFfmpeg('/tmp/x.mp3', start)).rejects.not.toThrow(FFMPEG_MISSING)
  })
})

describe('however the platform reports a missing program', () => {
  /*
   * Node attaches `code: 'ENOENT'` to the error it passes to the child's
   * `error` event, and the message carries it too. Both are checked because
   * this is the one path the unit suite cannot see working for real — the
   * module that actually spawns is a thin wrapper around `child_process`,
   * and a wrapper that lost the `code` would turn the most likely failure
   * this tool has into an unexplained stack trace.
   */
  it('recognises it from the message alone', async () => {
    const { start } = stub([], new Error('spawn ffmpeg ENOENT'))

    await expect(decodeWithFfmpeg('/tmp/x.mp3', start)).rejects.toThrow(FFMPEG_MISSING)
  })

  it('recognises it from the code alone', async () => {
    const { start } = stub([], Object.assign(new Error('could not start it'), { code: 'ENOENT' }))

    await expect(decodeWithFfmpeg('/tmp/x.mp3', start)).rejects.toThrow(FFMPEG_MISSING)
  })
})
