import { encodeWav, SAMPLE_RATE } from './wav.js'

/**
 * Sends the windows the language is decided from.
 *
 * Cut from the samples the tab already holds, so this costs one `subarray`
 * and forty-four bytes of header per probe — the episode is decoded once
 * for the split and the probes come out of the same array. Nothing is
 * re-decoded and nothing is read from the file twice.
 *
 * Deliberately not part of `splitAndUpload`. These windows are uploaded,
 * transcribed and deleted before the episode's own chunks are cut at all,
 * because the answer they produce has to be recorded on the episode first:
 * every chunk states the episode's language when it is sent, and a chunk
 * sent before the language was settled would be transcribed as whatever the
 * row happened to say.
 */

export interface ProbeTarget {
  readonly index: number
  readonly startMs: number
  readonly endMs: number
  readonly uploadUrl: string
}

const CONTENT_TYPE = 'audio/wav'

export async function uploadProbes(
  samples: Float32Array,
  targets: readonly ProbeTarget[],
): Promise<void> {
  for (const probe of targets) {
    /*
     * The same arithmetic the chunk cutting uses, and worth the same care.
     * A window taken from the wrong offset is not a crash — it is the
     * language of the episode decided from audio nobody chose, and the
     * offset that would hurt most is the one at the start of the file,
     * where the show's intro answers English every time.
     */
    const from = Math.floor((probe.startMs / 1000) * SAMPLE_RATE)
    const to = Math.floor((probe.endMs / 1000) * SAMPLE_RATE)

    const body = new Blob([encodeWav(samples.subarray(from, to))], { type: CONTENT_TYPE })

    const response = await fetch(probe.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': CONTENT_TYPE },
      body,
    })

    if (!response.ok) {
      /*
       * Loud rather than skipped. A detection run on fewer windows than
       * were planned is a weaker vote than it looks — two probes that fail
       * silently leave the episode's language decided by one, which is the
       * thing three windows exist to avoid.
       */
      throw new Error(`probe ${probe.index} upload failed: ${response.status}`)
    }
  }
}
