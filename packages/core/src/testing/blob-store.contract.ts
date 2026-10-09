import { describe, expect, it } from 'vitest'
import type { BlobStore } from '../ports/blob-store.js'

/** What a test must provide to be held to this contract. */
export interface BlobStoreUnderTest {
  readonly store: BlobStore
  /**
   * Resolves a URL the store handed out, back to bytes.
   *
   * Supplied by the harness rather than assumed to be `fetch`, because the
   * point of the contract is the round trip, and a fake has no HTTP. What
   * must match across implementations is that the URL leads to the bytes —
   * not how it is dereferenced.
   */
  read(url: string): Promise<Uint8Array>
  /** A key prefix nothing else is using. */
  readonly prefix: string
  /**
   * Sends bytes to an upload URL the store handed out, as a browser would.
   *
   * Supplied by the harness for the same reason `read` is: what has to match
   * across implementations is that the URL accepts the bytes, not how they
   * get there.
   */
  write(url: string, bytes: Uint8Array, contentType: string): Promise<void>
  teardown?(): Promise<void>
}

const OPUS = 'audio/ogg'
const bytes = (...values: number[]): Uint8Array => new Uint8Array(values)

/**
 * The contract every `BlobStore` has to satisfy, fake included.
 */
export function describeBlobStore(
  name: string,
  setUp: () => Promise<BlobStoreUnderTest>,
): void {
  describe(`${name} (BlobStore contract)`, () => {
    const withStore = async (
      body: (subject: BlobStoreUnderTest, key: (name: string) => string) => Promise<void>,
    ): Promise<void> => {
      const subject = await setUp()
      try {
        await body(subject, (name) => `${subject.prefix}/${name}`)
      } finally {
        await subject.teardown?.()
      }
    }

    it('hands back a URL that leads to the bytes', async () => {
      await withStore(async (subject, key) => {
        const audio = bytes(0x4f, 0x67, 0x67, 0x53)
        await subject.store.put(key('one.opus'), audio, OPUS)

        const url = await subject.store.readUrl(key('one.opus'), 600)

        expect(await subject.read(url)).toEqual(audio)
      })
    })

    // The thing most likely to put the same key twice is a retry, and one
    // that cannot overwrite its own half-finished upload is stuck forever.
    it('replaces what was there', async () => {
      await withStore(async (subject, key) => {
        await subject.store.put(key('two.opus'), bytes(1, 1, 1), OPUS)
        await subject.store.put(key('two.opus'), bytes(2, 2), OPUS)

        const url = await subject.store.readUrl(key('two.opus'), 600)

        expect(await subject.read(url)).toEqual(bytes(2, 2))
      })
    })

    it('keeps keys apart', async () => {
      await withStore(async (subject, key) => {
        await subject.store.put(key('a.opus'), bytes(0xa), OPUS)
        await subject.store.put(key('b.opus'), bytes(0xb), OPUS)

        expect(await subject.read(await subject.store.readUrl(key('a.opus'), 600))).toEqual(bytes(0xa))
        expect(await subject.read(await subject.store.readUrl(key('b.opus'), 600))).toEqual(bytes(0xb))
      })
    })

    // A URL that fails later, at the provider, is a failure with no visible
    // cause. Better to refuse here, where the key is still in hand.
    it('refuses to sign a key that is not there', async () => {
      await withStore(async (subject, key) => {
        await expect(subject.store.readUrl(key('missing.opus'), 600)).rejects.toThrow()
      })
    })

    // The whole reason this method exists: the bytes must be able to reach
    // storage without passing through a server that cannot hold them.
    it('takes an upload sent straight to the url it hands out', async () => {
      await withStore(async (subject, key) => {
        const url = await subject.store.uploadUrl(key('direct.opus'), 600)
        await subject.write(url, bytes(0x11, 0x22, 0x33), OPUS)

        const back = await subject.store.readUrl(key('direct.opus'), 600)
        expect(await subject.read(back)).toEqual(bytes(0x11, 0x22, 0x33))
      })
    })

    // The opposite of `readUrl`, which must refuse a key that is not there.
    // Nothing has been uploaded yet — that is the point of an upload URL.
    it('signs an upload for a key that does not exist yet', async () => {
      await withStore(async (subject, key) => {
        const url = await subject.store.uploadUrl(key('new.opus'), 600)

        expect(url.length).toBeGreaterThan(0)
      })
    })

    it('signs a different url per key', async () => {
      await withStore(async (subject, key) => {
        const first = await subject.store.uploadUrl(key('p.opus'), 600)
        const second = await subject.store.uploadUrl(key('q.opus'), 600)

        expect(first).not.toBe(second)
      })
    })

    it('frees the space', async () => {
      await withStore(async (subject, key) => {
        await subject.store.put(key('gone.opus'), bytes(9), OPUS)
        await subject.store.remove([key('gone.opus')])

        await expect(subject.store.readUrl(key('gone.opus'), 600)).rejects.toThrow()
      })
    })

    it('removes several at once', async () => {
      await withStore(async (subject, key) => {
        await subject.store.put(key('x.opus'), bytes(1), OPUS)
        await subject.store.put(key('y.opus'), bytes(2), OPUS)

        await subject.store.remove([key('x.opus'), key('y.opus')])

        await expect(subject.store.readUrl(key('x.opus'), 600)).rejects.toThrow()
        await expect(subject.store.readUrl(key('y.opus'), 600)).rejects.toThrow()
      })
    })

    // Cleanup runs after an episode is done and may be retried. Needing to
    // know what it managed last time would make it the caller's problem.
    it('does not mind removing what is already gone', async () => {
      await withStore(async (subject, key) => {
        await expect(subject.store.remove([key('never.opus')])).resolves.toBeUndefined()
      })
    })

    it('does nothing for an empty removal', async () => {
      await withStore(async (subject) => {
        await expect(subject.store.remove([])).resolves.toBeUndefined()
      })
    })
  })
}
