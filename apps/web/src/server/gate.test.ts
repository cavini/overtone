// US-043
import { describe, expect, it } from 'vitest'
import { matches, tokenFor } from './gate.js'

describe('tokenFor', () => {
  it('is the same every time for the same password', async () => {
    expect(await tokenFor('abre-te sésamo')).toBe(await tokenFor('abre-te sésamo'))
  })

  it('is different for a different password', async () => {
    expect(await tokenFor('one')).not.toBe(await tokenFor('two')) 
  })

  // The cookie is what a browser carries around. The password must not be
  // recoverable from it, or the gate is worse than no gate — it hands the
  // shared secret to anyone who reads a cookie jar.
  it('does not contain the password', async () => {
    const token = await tokenFor('pirão')

    expect(token).not.toContain('pirão')
    expect(token).toMatch(/^[0-9a-f]{64}$/u)
  })

  it('is not fooled by a password that differs only in accents', async () => {
    expect(await tokenFor('pirao')).not.toBe(await tokenFor('pirão'))
  })
})

describe('matches', () => {
  it('accepts the right token', async () => {
    const token = await tokenFor('segredo')

    expect(matches(token, token)).toBe(true)
  })

  it('rejects the wrong one', async () => {
    expect(matches(await tokenFor('segredo'), await tokenFor('outro'))).toBe(false)
  })

  // A cookie that is absent, empty, or truncated must fail like any other
  // wrong value, not throw and not accidentally pass.
  it.each([undefined, '', 'short', null])('rejects %o', async (given) => {
    expect(matches(given as string | undefined, await tokenFor('segredo'))).toBe(false)
  })

  it('rejects a prefix of the right token', async () => {
    const token = await tokenFor('segredo')

    expect(matches(token.slice(0, -1), token)).toBe(false)
  })

  // Compared in constant time, so the number of correct leading characters
  // cannot be read off the response time.
  it('looks at the whole value even when the first character is wrong', async () => {
    const token = await tokenFor('segredo')
    const wrongFirst = `${token[0] === 'a' ? 'b' : 'a'}${token.slice(1)}`

    expect(matches(wrongFirst, token)).toBe(false)
  })
})
