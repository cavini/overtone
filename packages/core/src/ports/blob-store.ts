/**
 * Where an episode's audio lives between being uploaded and being
 * transcribed.
 *
 * Not an implementation detail of the upload. Pacing means a chunk sent an
 * hour from now has to still be fetchable then (ADR 0020), and the provider
 * fetches audio by URL rather than taking bytes from us — so the audio has to
 * outlive the request that carried it.
 *
 * `remove` is not housekeeping, it is what makes the numbers work. At 16 kHz
 * mono WAV a 2h06m episode is ~243 MB against a 1 GB tier, and pacing drains
 * its chunks over an hour or more — so three uploads in one day would collide
 * if the bytes were kept. Chunk audio is dead weight the moment its
 * transcript is stored, because `transcripts.raw_provider_payload` is what
 * re-derivation reads. Freed per chunk, storage stops being a ceiling at all;
 * see `freedAudio`.
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
   * A URL the **browser** can upload one object to, directly.
   *
   * Not a convenience. A serverless function accepts about 4.5 MB of request
   * body, and an episode of this show is a hundred times that — uploading
   * through the server is not slow, it is impossible. The bytes have to go
   * from the browser to storage without passing through us, and a signed URL
   * is how that happens without putting a storage key in a browser.
   */
  uploadUrl(key: string, ttlSeconds: number): Promise<string>
  /**
   * Frees the space. Succeeds for keys that are already gone, so cleanup can
   * be retried without first checking what it managed last time.
   */
  remove(keys: readonly string[]): Promise<void>
  /**
   * Every key stored under a prefix.
   *
   * For finding audio that belongs to nothing. An upload that was
   * interrupted, or an episode that was thrown away, leaves its chunks
   * behind — measured on the real bucket, two deleted episodes had left
   * 43.9 MB on a tier that holds a gigabyte. Nothing else can find them,
   * because the database no longer mentions them at all.
   */
  list(prefix: string): Promise<readonly string[]>
}
