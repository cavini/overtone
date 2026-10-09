// US-041 · ADR 0020
import { describe, expect, it } from 'vitest'
import { describeBlobStore } from './blob-store.contract.js'
import { FakeBlobStore } from './fake-blob-store.js'

describeBlobStore('FakeBlobStore', () => {
  const store = new FakeBlobStore()
  return Promise.resolve({
    store,
    read: (url: string) => store.read(url),
    prefix: 'episodes/fake',
  })
})

describe('FakeBlobStore', () => {
  it('passes the expiry on, so a test can see which was asked for', async () => {
    const store = new FakeBlobStore()
    await store.put('k', new Uint8Array([1]), 'audio/ogg')

    expect(await store.readUrl('k', 900)).toContain('expires_in=900')
  })

  it('remembers the content type it was given', async () => {
    const store = new FakeBlobStore()
    await store.put('k', new Uint8Array([1]), 'audio/ogg')

    expect(store.contentTypes.get('k')).toBe('audio/ogg')
  })
})
