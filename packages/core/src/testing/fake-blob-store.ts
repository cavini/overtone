import type { BlobStore } from '../ports/blob-store.js'

/** The schemes the fake's URLs use, so a test can tell one apart. */
const SCHEME = 'fake-blob:'
const UPLOAD_SCHEME = 'fake-blob-upload:'

/**
 * A blob store that keeps bytes in memory.
 *
 * Its URLs are not fetchable — nothing in a pure package can serve HTTP — so
 * it hands out `fake-blob:<key>` and `read` resolves that back. The contract
 * suite takes the dereferencing as the harness's job for exactly this reason.
 */
export class FakeBlobStore implements BlobStore {
  private readonly contents = new Map<string, Uint8Array>()
  readonly contentTypes = new Map<string, string>()

  put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.contents.set(key, bytes)
    this.contentTypes.set(key, contentType)
    return Promise.resolve()
  }

  readUrl(key: string, ttlSeconds: number): Promise<string> {
    if (!this.contents.has(key)) {
      return Promise.reject(new Error(`no blob at ${key}`))
    }
    // The expiry is carried in the URL so a test can see it was passed on,
    // and so two calls for the same key are not accidentally equal.
    return Promise.resolve(`${SCHEME}${key}?expires_in=${ttlSeconds}`)
  }

  uploadUrl(key: string, ttlSeconds: number): Promise<string> {
    // Signed for a key that does not exist yet — that is the whole point of
    // an upload URL, and the opposite of `readUrl`.
    return Promise.resolve(`${UPLOAD_SCHEME}${key}?expires_in=${ttlSeconds}`)
  }

  remove(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      this.contents.delete(key)
      this.contentTypes.delete(key)
    }
    return Promise.resolve()
  }

  /**
   * Every key under a prefix.
   *
   * Flat, because this holds whole keys rather than folders — which is the
   * same answer the real store gives once it has walked into them.
   */
  list(prefix: string): Promise<readonly string[]> {
    return Promise.resolve([...this.contents.keys()].filter((key) => key.startsWith(prefix)))
  }

  /** Accepts an upload sent to one of this store's own upload URLs. */
  write(url: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const key = url.slice(UPLOAD_SCHEME.length).split('?')[0] ?? ''

    return this.put(key, bytes, contentType)
  }

  /** Resolves one of this store's own URLs. */
  read(url: string): Promise<Uint8Array> {
    const key = url.slice(SCHEME.length).split('?')[0] ?? ''
    const found = this.contents.get(key)
    if (found === undefined) return Promise.reject(new Error(`no blob at ${key}`))

    return Promise.resolve(found)
  }

  get size(): number {
    return this.contents.size
  }
}
