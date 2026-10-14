// The fingerprint that makes re-running this safe.
//
// `/api/episodes/start` dedupes on it: the same audio under a different name
// is the same episode, and the app answers `alreadyHave` rather than
// accepting a second copy. Re-transcribing a two-hour episode costs about a
// third of a day's free allowance to produce the transcript already stored,
// so this is what a resumed run leans on.
//
// It has to be byte-for-byte the same hash the browser computes — SHA-256 of
// the file, in lower-case hex — or the app would hold two rows for one
// episode depending on which uploaded it.
import { describe, expect, it } from 'vitest'
import { digestOf } from './audio-digest.js'

const chunks = async function* (...parts: readonly string[]): AsyncGenerator<Uint8Array> {
  for (const part of parts) yield new TextEncoder().encode(part)
}

/** The published SHA-256 of "abc", which is what makes this a real check. */
const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

describe('digestOf', () => {
  it('is sha-256, in lower-case hex', async () => {
    expect(await digestOf(chunks('abc'))).toBe(ABC)
  })

  /*
   * The file arrives in reads of whatever size the disk felt like, and a
   * digest that depended on that would never match the browser's — which
   * hashes the whole file at once.
   */
  it('does not depend on how the bytes were read', async () => {
    expect(await digestOf(chunks('a', 'b', 'c'))).toBe(ABC)
  })

  it('tells two episodes apart', async () => {
    expect(await digestOf(chunks('abc'))).not.toBe(await digestOf(chunks('abd')))
  })
})
