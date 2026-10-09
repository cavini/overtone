/**
 * Where an episode's audio lives between being uploaded and being
 * transcribed.
 *
 * Not an implementation detail of the upload. Pacing means a chunk sent an
 * hour from now has to still be fetchable then (ADR 0020), and the provider
 * fetches audio by URL rather than taking bytes from us — so the audio has to
 * outlive the request that carried it.
 *
 * Storage is the ceiling that arrives first on the free tier: 1 GB, against
 * ~22 MB an episode. `remove` is not housekeeping, it is what makes the
 * numbers work — chunk audio is dead weight once the episode is transcribed,
 * because `transcripts.raw_provider_payload` is what re-derivation reads.
 */
export interface BlobStore {
  /**
   * Stores bytes under a key, replacing whatever was there.
   *
   * Replacing rather than failing, because the thing most likely to call this
   * twice is a retry, and a retry that cannot overwrite its own half-finished
   * upload is stuck forever.
   */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  /**
   * A URL the transcription provider can fetch, good for `ttlSeconds`.
   *
   * Signed and short-lived: the bucket is private, and the alternative —
   * public audio — would put the group's unpublished episodes on the open
   * web. Rejects for a key that is not there, rather than handing back a URL
   * that fails later at the provider where the cause is invisible.
   */
  readUrl(key: string, ttlSeconds: number): Promise<string>
  /**
   * Frees the space. Succeeds for keys that are already gone, so cleanup can
   * be retried without first checking what it managed last time.
   */
  remove(keys: readonly string[]): Promise<void>
}
