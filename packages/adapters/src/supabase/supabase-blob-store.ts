import type { BlobStore } from '@overtone/core'

export interface SupabaseBlobStoreOptions {
  /** `https://PROJECT.supabase.co` */
  readonly projectUrl: string
  /**
   * The secret key. Server-side only.
   *
   * Storage policies are not what protects this bucket — the server is. The
   * bucket is private and no browser ever holds a key that can read it; the
   * only way in is a signed URL this adapter mints for one object at a time.
   */
  readonly secretKey: string
  readonly bucket: string
  readonly fetch?: typeof globalThis.fetch
}

/** Supabase returns the signed path relative to the storage API. */
interface SignedUrlResponse {
  readonly signedURL?: string
  readonly signedUrl?: string
}

/**
 * Episode audio in Supabase Storage.
 *
 * Spoken to over its REST API with an injected `fetch` rather than through
 * the JS client, for the same reason the Groq adapter does: the seam that
 * makes it testable is the one the test needs, and the client would hide it.
 */
export class SupabaseBlobStore implements BlobStore {
  private readonly storage: string
  private readonly bucket: string
  private readonly secretKey: string
  private readonly fetch: typeof globalThis.fetch

  constructor(options: SupabaseBlobStoreOptions) {
    this.storage = `${options.projectUrl.replace(/\/+$/u, '')}/storage/v1`
    this.bucket = options.bucket
    this.secretKey = options.secretKey
    this.fetch = options.fetch ?? globalThis.fetch
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      authorization: `Bearer ${this.secretKey}`,
      apikey: this.secretKey,
      ...extra,
    }
  }

  /** Each segment escaped, so a key may contain anything a key may contain. */
  private objectPath(key: string): string {
    const escaped = key.split('/').map(encodeURIComponent).join('/')
    return `${encodeURIComponent(this.bucket)}/${escaped}`
  }

  private async failureFrom(response: Response, doing: string): Promise<Error> {
    const body = await response.text().catch(() => '')
    return new Error(
      `supabase storage: could not ${doing} (${response.status}) ${body}`.trim(),
    )
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const response = await this.fetch(`${this.storage}/object/${this.objectPath(key)}`, {
      method: 'POST',
      headers: this.headers({
        'content-type': contentType,
        // Replace rather than refuse. A retry has to be able to overwrite its
        // own half-finished upload.
        'x-upsert': 'true',
      }),
      // A fresh view, because `bytes` may be a slice of a larger buffer and
      // the body would otherwise carry the whole thing.
      body: bytes.slice(),
    })

    if (!response.ok) throw await this.failureFrom(response, `store ${key}`)
  }

  async readUrl(key: string, ttlSeconds: number): Promise<string> {
    const response = await this.fetch(`${this.storage}/object/sign/${this.objectPath(key)}`, {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ expiresIn: ttlSeconds }),
    })

    // Signing a key that is not there fails here, which is where the key is
    // still in hand — rather than at the provider, where a 404 on an opaque
    // URL says nothing about why.
    if (!response.ok) throw await this.failureFrom(response, `sign ${key}`)

    const payload = (await response.json()) as SignedUrlResponse
    const signed = payload.signedURL ?? payload.signedUrl
    if (signed === undefined || signed.length === 0) {
      throw new Error(`supabase storage: no signed url came back for ${key}`)
    }

    // The path comes back relative to the storage API.
    return signed.startsWith('http') ? signed : `${this.storage}${signed.startsWith('/') ? '' : '/'}${signed}`
  }

  async uploadUrl(key: string, ttlSeconds: number): Promise<string> {
    // Supabase signs uploads for keys that do not exist yet, which is what
    // makes this the browser's way in: it gets permission for exactly one
    // object, for a few minutes, and never sees a storage key.
    const response = await this.fetch(
      `${this.storage}/object/upload/sign/${this.objectPath(key)}`,
      {
        method: 'POST',
        headers: this.headers({ 'content-type': 'application/json' }),
        body: JSON.stringify({ expiresIn: ttlSeconds }),
      },
    )

    if (!response.ok) throw await this.failureFrom(response, `sign an upload for ${key}`)

    const payload = (await response.json()) as { url?: string }
    if (payload.url === undefined || payload.url.length === 0) {
      throw new Error(`supabase storage: no upload url came back for ${key}`)
    }

    return payload.url.startsWith('http')
      ? payload.url
      : `${this.storage}${payload.url.startsWith('/') ? '' : '/'}${payload.url}`
  }

  async remove(keys: readonly string[]): Promise<void> {
    // Nothing to ask for, so nothing is asked. Supabase treats an empty list
    // as a bad request.
    if (keys.length === 0) return

    const response = await this.fetch(`${this.storage}/object/${encodeURIComponent(this.bucket)}`, {
      method: 'DELETE',
      headers: this.headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ prefixes: [...keys] }),
    })

    // A key already gone is the outcome cleanup wanted, so it is not an
    // error. Supabase reports it as success with nothing deleted anyway.
    if (!response.ok) throw await this.failureFrom(response, 'remove objects')
  }
}
