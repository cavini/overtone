/**
 * The shape of every key the uploader writes.
 *
 * Anything that does not match is left alone, whatever it is. A sweep that
 * deleted what it did not recognise would be a sweep that deletes somebody
 * else's bucket the first time the layout changes.
 */
const CHUNK_KEY = /^episodes\/([0-9a-f-]{36})\/chunk-\d+\.wav$/u

/** What a sweep decided to do. */
export type Sweep =
  | { readonly sweep: readonly string[] }
  /**
   * Refused, because the library came back empty.
   *
   * An empty library with audio still in storage is indistinguishable from
   * a database read that failed — and the two call for opposite actions.
   * The expensive mistake is only available in one direction, so it refuses
   * and says why.
   */
  | { readonly refuse: 'no-live-episodes' }

/**
 * Which stored audio belongs to no episode any more.
 *
 * Audio is deleted once an episode is transcribed — the transcript is the
 * durable artifact (ADR 0005) — so anything left belongs to an upload that
 * was interrupted or an episode that was thrown away. Measured on the real
 * bucket: two deleted episodes had left 43.9 MB behind, on a tier that
 * holds a gigabyte.
 *
 * Matching is exact and the unrecognised is never touched.
 */
export function orphanedAudio(keys: readonly string[], live: ReadonlySet<string>): Sweep {
  const theirs = keys.filter((key) => CHUNK_KEY.test(key))

  if (live.size === 0 && theirs.length > 0) return { refuse: 'no-live-episodes' }

  return {
    sweep: theirs.filter((key) => {
      const episodeId = CHUNK_KEY.exec(key)?.[1]

      return episodeId !== undefined && !live.has(episodeId)
    }),
  }
}
