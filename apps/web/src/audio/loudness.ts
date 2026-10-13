/**
 * How much audio each entry of a loudness profile covers.
 *
 * Twenty milliseconds is the usual frame for speech work: long enough to
 * average out a single glottal pulse, short enough that a 300 ms gap is
 * fifteen frames rather than one or two. It also keeps the profile small —
 * a two-hour episode becomes 360 000 numbers rather than 115 million.
 */
export const FRAME_MS = 20

/**
 * The loudness of each frame, as root-mean-square amplitude.
 *
 * RMS rather than a mean, because a waveform swings symmetrically about
 * zero: the average sample of a loud tone is zero, so an implementation
 * that averaged the samples would read every frame as silence, find no gaps
 * anywhere, and quietly leave every cut exactly where it already was. That
 * failure looks like the feature doing nothing, which is the hardest kind
 * to notice.
 */
export function loudnessProfile(samples: Float32Array, sampleRate: number): Float32Array {
  const perFrame = Math.max(1, Math.round((FRAME_MS / 1000) * sampleRate))
  const frames = Math.floor(samples.length / perFrame)
  const profile = new Float32Array(frames)

  for (let frame = 0; frame < frames; frame += 1) {
    const from = frame * perFrame
    let total = 0
    for (let at = from; at < from + perFrame; at += 1) {
      const sample = samples[at] ?? 0
      total += sample * sample
    }
    profile[frame] = Math.sqrt(total / perFrame)
  }

  return profile
}
