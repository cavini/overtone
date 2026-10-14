import { SAMPLE_RATE } from './wav.js'

/**
 * Turning an audio file into samples, using the decoder the browser has.
 *
 * This is the one piece of the upload that is genuinely browser-only, and
 * splitting it out is what lets the rest run anywhere: measuring loudness,
 * moving the seams into the gaps, reporting where they landed and sending
 * each chunk are all ordinary arithmetic over a `Float32Array`.
 *
 * `decodeAudioData` is also a lot of codecs for free — MP3, AAC, Opus, FLAC
 * — which is why the app accepts whatever the group exports rather than one
 * format.
 */

/**
 * Everything mixed down to one channel.
 *
 * Whisper is mono, and averaging here rather than sending both halves is
 * what keeps a chunk inside the file cap. Averaging — not just taking the
 * left — because a podcast edit can easily put one voice on one side.
 */
function toMono(decoded: AudioBuffer): Float32Array {
  if (decoded.numberOfChannels === 1) return decoded.getChannelData(0)

  const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) =>
    decoded.getChannelData(index),
  )
  const mixed = new Float32Array(decoded.length)

  for (let sample = 0; sample < mixed.length; sample += 1) {
    let total = 0
    for (const channel of channels) total += channel[sample] ?? 0
    mixed[sample] = total / channels.length
  }

  return mixed
}

/**
 * The whole episode as 16 kHz mono samples.
 *
 * Decoded straight to 16 kHz on the way in, so the samples held in memory
 * are the ones that will be sent rather than six times as many at CD rate.
 * The context is closed either way: a tab is allowed only a handful at once,
 * so one leaked per refused file is a page that stops being able to decode.
 */
export async function decodeInBrowser(file: File): Promise<Float32Array> {
  const context = new AudioContext({ sampleRate: SAMPLE_RATE })

  try {
    return toMono(await context.decodeAudioData(await file.arrayBuffer()))
  } finally {
    await context.close()
  }
}
