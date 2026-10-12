// US-041 · ADR 0020
//
// The blob store against real Supabase Storage. The signed-URL round trip is
// the whole point of this adapter and there is no way to fake it honestly:
// what matters is that the provider can fetch what the URL points at.
//
// Skipped without credentials, because CI has none.
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describeBlobStore } from '@overtone/core/testing'
import { describe, it } from 'vitest'
import { SupabaseBlobStore } from './supabase-blob-store.js'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const projectUrl = process.env['NEXT_PUBLIC_SUPABASE_URL']
const secretKey = process.env['SUPABASE_SECRET_KEY']

if (projectUrl === undefined || secretKey === undefined) {
  describe('SupabaseBlobStore (BlobStore contract)', () => {
    it.skip('needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY', () => {})
  })
} else {
  const store = new SupabaseBlobStore({ projectUrl, secretKey, bucket: 'episode-audio' })

  // A prefix per run, so a leftover object from a failed run cannot make
  // the next one pass. Not random — `Math.random` is banned in this repo and
  // the process id is just as unique for the purpose.
  const prefix = `contract/${process.pid}`

  describeBlobStore('SupabaseBlobStore', () =>
    Promise.resolve({
      store,
      read: async (url: string) => {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`signed url gave ${response.status}`)

        return new Uint8Array(await response.arrayBuffer())
      },
      write: async (url: string, body: Uint8Array, contentType: string) => {
        // Exactly what the browser does: PUT the bytes at the signed URL,
        // carrying no credential of its own.
        const response = await fetch(url, {
          method: 'PUT',
          headers: { 'content-type': contentType },
          body: body.slice(),
        })
        if (!response.ok) {
          throw new Error(`upload url gave ${response.status} ${await response.text()}`)
        }
      },
      prefix,
      /*
       * Whatever the contract named, not a list kept here.
       *
       * This was a hardcoded eleven names, and the contract had grown past
       * it: `outside.opus` and `inside/one.opus` were never removed, and
       * were still in the production bucket from runs days before. Small
       * objects, but an unbounded count, from the suite whose own comment
       * says leaving audio behind eats the tier an object at a time.
       */
      teardown: (keys) => store.remove(keys),
    }),
  )
}
