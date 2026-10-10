// US-041 · ADR 0020
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SupabaseBlobStore } from './supabase-blob-store.js'

const PROJECT = 'https://project.supabase.co'
const STORAGE = `${PROJECT}/storage/v1`
const BYTES = new Uint8Array([0x4f, 0x67, 0x67, 0x53])

interface Call {
  readonly url: string
  readonly method: string
  readonly headers: Record<string, string>
  readonly body: unknown
}

let calls: Call[]

const storeThat = (respond: (url: string) => Response, projectUrl = PROJECT) => {
  const fetchImpl = vi.fn((input: unknown, init?: RequestInit) => {
    const url = String(input)
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body,
    })
    return Promise.resolve(respond(url))
  })

  return new SupabaseBlobStore({
    projectUrl,
    secretKey: 'sb_secret_test',
    bucket: 'episode-audio',
    fetch: fetchImpl as unknown as typeof globalThis.fetch,
  })
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const signed = (url: string) =>
  url.includes('/object/sign/')
    ? json({ signedURL: '/object/sign/episode-audio/k.opus?token=abc' })
    : new Response('', { status: 200 })

beforeEach(() => {
  calls = []
})

describe('SupabaseBlobStore', () => {
  describe('put', () => {
    it('posts the bytes to the object path', async () => {
      await storeThat(signed).put('episodes/1/chunk-0.opus', BYTES, 'audio/ogg')

      expect(calls[0]?.url).toBe(`${STORAGE}/object/episode-audio/episodes/1/chunk-0.opus`)
      expect(calls[0]?.method).toBe('POST')
      expect(calls[0]?.headers['content-type']).toBe('audio/ogg')
    })

    // A retry has to be able to overwrite its own half-finished upload.
    it('asks to replace rather than refuse', async () => {
      await storeThat(signed).put('k.opus', BYTES, 'audio/ogg')

      expect(calls[0]?.headers['x-upsert']).toBe('true')
    })

    it('authenticates with the secret key', async () => {
      await storeThat(signed).put('k.opus', BYTES, 'audio/ogg')

      expect(calls[0]?.headers['authorization']).toBe('Bearer sb_secret_test')
      expect(calls[0]?.headers['apikey']).toBe('sb_secret_test')
    })

    // A slice of a larger buffer must not drag the whole buffer along.
    it('sends only the bytes it was given', async () => {
      const backing = new Uint8Array([9, 9, 0x4f, 0x67, 9, 9])
      await storeThat(signed).put('k.opus', backing.subarray(2, 4), 'audio/ogg')

      expect(calls[0]?.body).toEqual(new Uint8Array([0x4f, 0x67]))
    })

    it('says what it could not do, and what the service said', async () => {
      const store = storeThat(() => new Response('mime type not allowed', { status: 415 }))

      await expect(store.put('k.wav', BYTES, 'audio/wav')).rejects.toThrow(
        /could not store k\.wav \(415\) mime type not allowed/u,
      )
    })

    // Keys name chunks of someone's episode, so they can contain anything a
    // title can. An unescaped space makes an invalid URL.
    it('escapes each segment of the key', async () => {
      await storeThat(signed).put('episodes/ep 12/chunk 0.opus', BYTES, 'audio/ogg')

      expect(calls[0]?.url).toBe(`${STORAGE}/object/episode-audio/episodes/ep%2012/chunk%200.opus`)
    })

    it('does not mind a project url with a trailing slash', async () => {
      await storeThat(signed, `${PROJECT}/`).put('k.opus', BYTES, 'audio/ogg')

      expect(calls[0]?.url).toBe(`${STORAGE}/object/episode-audio/k.opus`)
    })
  })

  describe('readUrl', () => {
    it('asks for a url that expires', async () => {
      await storeThat(signed).readUrl('k.opus', 900)

      expect(calls[0]?.url).toBe(`${STORAGE}/object/sign/episode-audio/k.opus`)
      expect(JSON.parse(String(calls[0]?.body))).toEqual({ expiresIn: 900 })
    })

    // Supabase returns the path relative to the storage API.
    it('makes the relative path it gets back absolute', async () => {
      const url = await storeThat(signed).readUrl('k.opus', 600)

      expect(url).toBe(`${STORAGE}/object/sign/episode-audio/k.opus?token=abc`)
    })

    it('copes with the path missing its leading slash', async () => {
      const store = storeThat(() => json({ signedURL: 'object/sign/episode-audio/k.opus?t=1' }))

      expect(await store.readUrl('k.opus', 600)).toBe(`${STORAGE}/object/sign/episode-audio/k.opus?t=1`)
    })

    // The field has been spelled both ways across versions of the API.
    it('accepts either spelling of the field', async () => {
      const store = storeThat(() => json({ signedUrl: '/object/sign/episode-audio/k.opus?t=2' }))

      expect(await store.readUrl('k.opus', 600)).toContain('t=2')
    })

    it('leaves an already absolute url alone', async () => {
      const store = storeThat(() => json({ signedURL: 'https://cdn.example/k.opus?t=3' }))

      expect(await store.readUrl('k.opus', 600)).toBe('https://cdn.example/k.opus?t=3')
    })

    // Better to fail here, where the key is still in hand, than at the
    // provider — where a 404 on an opaque URL says nothing about why.
    it('refuses a key the service will not sign', async () => {
      const store = storeThat(() => new Response('Object not found', { status: 400 }))

      await expect(store.readUrl('missing.opus', 600)).rejects.toThrow(
        /could not sign missing\.opus \(400\)/u,
      )
    })

    it.each([{}, { signedURL: '' }])('refuses an answer with no url in it (%o)', async (body) => {
      const store = storeThat(() => json(body))

      await expect(store.readUrl('k.opus', 600)).rejects.toThrow(/no signed url/u)
    })
  })

  describe('uploadUrl', () => {
    const signsUpload = (url: string) =>
      url.includes('/object/upload/sign/')
        ? json({ url: '/object/upload/sign/episode-audio/k.wav?token=up' })
        : new Response('', { status: 200 })

    it('asks for an upload that expires', async () => {
      await storeThat(signsUpload).uploadUrl('k.wav', 900)

      expect(calls[0]?.url).toBe(`${STORAGE}/object/upload/sign/episode-audio/k.wav`)
      expect(JSON.parse(String(calls[0]?.body))).toEqual({ expiresIn: 900 })
    })

    it('makes the relative path it gets back absolute', async () => {
      const url = await storeThat(signsUpload).uploadUrl('k.wav', 600)

      expect(url).toBe(`${STORAGE}/object/upload/sign/episode-audio/k.wav?token=up`)
    })

    it('copes with the path missing its leading slash', async () => {
      const store = storeThat(() => json({ url: 'object/upload/sign/episode-audio/k.wav?t=1' }))

      expect(await store.uploadUrl('k.wav', 600)).toBe(
        `${STORAGE}/object/upload/sign/episode-audio/k.wav?t=1`,
      )
    })

    it('leaves an already absolute url alone', async () => {
      const store = storeThat(() => json({ url: 'https://cdn.example/up?t=2' }))

      expect(await store.uploadUrl('k.wav', 600)).toBe('https://cdn.example/up?t=2')
    })

    // The browser has no other way in. A failure here must say so, not hand
    // back something that fails later in a place with no context.
    it('says when the service would not sign it', async () => {
      const store = storeThat(() => new Response('denied', { status: 403 }))

      await expect(store.uploadUrl('k.wav', 600)).rejects.toThrow(
        /could not sign an upload for k\.wav \(403\)/u,
      )
    })

    it.each([{}, { url: '' }])('refuses an answer with no url in it (%o)', async (body) => {
      const store = storeThat(() => json(body))

      await expect(store.uploadUrl('k.wav', 600)).rejects.toThrow(/no upload url/u)
    })

    it('escapes each segment of the key', async () => {
      await storeThat(signsUpload).uploadUrl('episodes/ep 12/chunk 0.wav', 600)

      expect(calls[0]?.url).toBe(
        `${STORAGE}/object/upload/sign/episode-audio/episodes/ep%2012/chunk%200.wav`,
      )
    })
  })

  describe('remove', () => {
    it('names the objects to delete', async () => {
      await storeThat(signed).remove(['a.opus', 'b.opus'])

      expect(calls[0]?.method).toBe('DELETE')
      expect(calls[0]?.url).toBe(`${STORAGE}/object/episode-audio`)
      expect(JSON.parse(String(calls[0]?.body))).toEqual({ prefixes: ['a.opus', 'b.opus'] })
    })

    // Nothing to ask for, so nothing is asked — the service treats an empty
    // list as a bad request.
    it('does not call the service for an empty list', async () => {
      await storeThat(signed).remove([])

      expect(calls).toHaveLength(0)
    })

    it('says what it could not do', async () => {
      const store = storeThat(() => new Response('denied', { status: 403 }))

      await expect(store.remove(['a.opus'])).rejects.toThrow(/could not remove objects \(403\)/u)
    })

    it('reports a failure even when the body is unreadable', async () => {
      const store = storeThat(() => new Response(null, { status: 500 }))

      await expect(store.remove(['a.opus'])).rejects.toThrow(/could not remove objects \(500\)/u)
    })
  })
})

describe('SupabaseBlobStore, listing', () => {
  /** The listing endpoint answers one level at a time. A folder has no id. */
  const folder = (name: string) => ({ name, id: null })
  const object = (name: string) => ({ name, id: `id-${name}` })

  const listing = (at: Record<string, unknown[]>) =>
    storeThat((url) => {
      if (!url.includes('/object/list/')) return new Response('{}', { status: 404 })
      const asked = String(JSON.parse(String(calls.at(-1)?.body ?? '{}')).prefix ?? '')

      return new Response(JSON.stringify(at[asked] ?? []), { status: 200 })
    })

  it('lists the objects at a prefix', async () => {
    const store = listing({ episodes: [object('a.wav'), object('b.wav')] })

    expect(await store.list('episodes/')).toEqual(['episodes/a.wav', 'episodes/b.wav'])
  })

  /*
   * The case the sweep depends on. An abandoned episode leaves a *folder*,
   * and a listing that stopped at the top level would find the folder and
   * none of the audio inside it — reporting nothing to clean up while the
   * tier filled.
   */
  it('walks into folders', async () => {
    const store = listing({
      episodes: [folder('ep-1')],
      'episodes/ep-1': [object('chunk-0.wav'), object('chunk-1.wav')],
    })

    expect([...(await store.list('episodes/'))].sort()).toEqual([
      'episodes/ep-1/chunk-0.wav',
      'episodes/ep-1/chunk-1.wav',
    ])
  })

  it('walks more than one level down', async () => {
    const store = listing({
      episodes: [folder('ep-1')],
      'episodes/ep-1': [folder('parts')],
      'episodes/ep-1/parts': [object('chunk-0.wav')],
    })

    expect(await store.list('episodes/')).toEqual(['episodes/ep-1/parts/chunk-0.wav'])
  })

  it('lists nothing where there is nothing', async () => {
    expect(await listing({}).list('episodes/')).toEqual([])
  })

  it('ignores an entry with no name', async () => {
    const store = storeThat(
      () => new Response(JSON.stringify([{ id: 'x' }, { name: '', id: 'y' }]), { status: 200 }),
    )

    expect(await store.list('episodes/')).toEqual([])
  })

  // Failing loudly: a sweep that read a failure as "nothing stored" would
  // report a clean bucket and leave it filling.
  it('throws when the service refuses', async () => {
    const store = storeThat(() => new Response('nope', { status: 500 }))

    await expect(store.list('episodes/')).rejects.toThrow()
  })
})

