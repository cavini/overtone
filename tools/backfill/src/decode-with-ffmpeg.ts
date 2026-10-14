import { SAMPLE_RATE } from './borrowed-from-the-app.js'
import type { ProgramEnd, StartProgram } from './spawn-program.js'

/**
 * The decoder the browser does not have to lend us.
 *
 * `splitAndUpload` needs the whole episode as 16 kHz mono `Float32Array` —
 * exactly what `AudioContext.decodeAudioData` hands a tab, and exactly what
 * `ffmpeg -f f32le` writes to a pipe. That equivalence is the reason the
 * seam exists at the decoder and not somewhere else: everything downstream
 * of the samples is arithmetic, and arithmetic runs anywhere.
 *
 * ffmpeg rather than a library: decoding MP3 in pure JavaScript means
 * shipping a codec, and this is a tool run from a terminal by the one person
 * who has the feed URL. It is the only thing here that is not already
 * installed, so the message for its absence is written out in full.
 */

/** Said out loud, with the command to run, because it is the first wall. */
export const FFMPEG_MISSING =
  'ffmpeg is not installed, and this tool decodes the audio with it. Install it with: brew install ffmpeg'

const COMMAND = 'ffmpeg'

/** Four bytes to a 32-bit float. */
const BYTES_PER_SAMPLE = 4

/**
 * Whether this is "there is no such program".
 *
 * Both signals, because this is the one path the unit suite cannot watch
 * working for real: the module that actually spawns is a thin wrapper around
 * `child_process`, and Node reports a missing program as an error carrying
 * `code: 'ENOENT'` *and* a message ending in `ENOENT`. Checking only the
 * property would turn the most likely failure this tool has — ffmpeg not
 * installed — into an unexplained stack trace if the wrapper ever lost it.
 */
const isMissing = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false
  if ((error as { code?: unknown }).code === 'ENOENT') return true

  return /\bENOENT\b/u.test(String((error as { message?: unknown }).message ?? ''))
}

/** Runs the program and collects stdout, with ENOENT turned into advice. */
async function run(
  start: StartProgram,
  args: readonly string[],
): Promise<{ readonly bytes: readonly Uint8Array[]; readonly end: ProgramEnd }> {
  const program = start(COMMAND, args)
  const bytes: Uint8Array[] = []

  try {
    // Read first, wait second. A program whose output nobody drains blocks
    // as soon as the pipe is full, which for an episode is immediately.
    for await (const piece of program.stdout) bytes.push(piece)

    return { bytes, end: await program.done }
  } catch (error) {
    if (isMissing(error)) throw new Error(FFMPEG_MISSING)
    throw error
  }
}

/**
 * Checks ffmpeg is there, before anything is downloaded.
 *
 * Finding out after pulling a hundred megabytes over somebody's connection
 * is a worse way to learn it.
 */
export async function requireFfmpeg(start: StartProgram): Promise<void> {
  const { end } = await run(start, ['-version'])

  if (end.code !== 0) {
    throw new Error(`ffmpeg is installed but would not run: ${end.stderr}`)
  }
}

/**
 * The whole episode as 16 kHz mono samples.
 *
 * Joined before it is interpreted, because a pipe splits a four-byte sample
 * down the middle as often as not — converting each read on its own would
 * put a click at every boundary, and the transcriber hears a click as a
 * consonant.
 */
export async function decodeWithFfmpeg(
  path: string,
  start: StartProgram,
): Promise<Float32Array> {
  const { bytes, end } = await run(start, [
    // Never prompt. Without this ffmpeg can sit waiting for a keystroke
    // nobody is going to send, in a run that is meant to be unattended.
    '-nostdin',
    '-loglevel',
    'error',
    '-i',
    path,
    // Mono, 16 kHz, 32-bit float, no container. The transcriber resamples
    // to 16 kHz mono regardless, and the chunk arithmetic is built on it.
    '-ac',
    '1',
    '-ar',
    String(SAMPLE_RATE),
    '-f',
    'f32le',
    '-',
  ])

  if (end.code !== 0) {
    throw new Error(`ffmpeg could not decode ${path}: ${end.stderr}`)
  }

  const samples = samplesFrom(bytes)

  if (samples.length === 0) {
    // Zero samples would be read downstream as a zero-length episode, which
    // `/api/episodes/start` refuses as unreadable audio — a long way from
    // the truth, which is that ffmpeg wrote nothing.
    throw new Error(`ffmpeg produced no audio from ${path}`)
  }

  return samples
}

/**
 * The bytes as samples, in one allocation.
 *
 * Little-endian because that is what `f32le` asked for and what every
 * machine this runs on is, so the bytes can be reinterpreted rather than
 * read one at a time — a two-hour episode is 115 million samples, and a
 * `DataView` read per sample is a visible pause for no benefit.
 */
function samplesFrom(parts: readonly Uint8Array[]): Float32Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  // Floored, not rounded: a trailing part-sample is not a sample, and
  // reading it as one would put a garbage value at the end of the episode.
  const samples = new Float32Array(Math.floor(total / BYTES_PER_SAMPLE))
  const joined = new Uint8Array(samples.buffer)

  let at = 0
  for (const part of parts) {
    // Clipped, for the same reason: the last part may run past the last
    // whole sample.
    const room = joined.length - at
    if (room <= 0) break
    joined.set(part.length > room ? part.subarray(0, room) : part, at)
    at += part.length
  }

  return samples
}
