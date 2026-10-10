// US-049 · a result can be shown to somebody without an account
import { describe, expect, it } from 'vitest'
import { looksLikeShareToken, newShareToken } from './share-token.js'

const counting = () => {
  let next = 0
  return (size: number) => Uint8Array.from({ length: size }, () => next++ % 256)
}

describe('newShareToken', () => {
  it('survives being a path segment', () => {
    const token = newShareToken(counting())

    expect(token).toBe(encodeURIComponent(token))
  })

  it('carries no padding to be cut off', () => {
    expect(newShareToken(counting())).not.toContain('=')
  })

  /*
   * The link is the whole permission, so two of them must never collide —
   * and more importantly a token must not be derivable from the episode it
   * names. One computed from an id is one somebody can recompute for an
   * episode they are guessing at, which makes every episode in the library
   * reachable by anybody who has seen a single link.
   */
  it('is different every time, from the randomness and nothing else', () => {
    const seen = new Set(
      Array.from({ length: 50 }, () =>
        newShareToken((size) => crypto.getRandomValues(new Uint8Array(size))),
      ),
    )

    expect(seen.size).toBe(50)
  })

  it('is long enough to be unguessable', () => {
    const token = newShareToken((size) => crypto.getRandomValues(new Uint8Array(size)))

    // 16 bytes of base64url, unpadded.
    expect(token.length).toBeGreaterThanOrEqual(21)
  })

  it('accepts what it produces', () => {
    const token = newShareToken((size) => crypto.getRandomValues(new Uint8Array(size)))

    expect(looksLikeShareToken(token)).toBe(true)
  })
})

describe('looksLikeShareToken', () => {
  it.each([
    ['empty', ''],
    ['too short', 'abc'],
    ['a path traversal', '../../etc/passwd'],
    ['a slash', 'abcdefghijklmnop/qr'],
    ['a wildcard', "abcdefghijklmnop' or '1'='1"],
    ['far too long', 'a'.repeat(200)],
  ])('turns away %s', (_what, value) => {
    expect(looksLikeShareToken(value)).toBe(false)
  })
})
