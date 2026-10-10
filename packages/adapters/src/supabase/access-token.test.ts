// US-002 · a token is only as good as its signature
import { describe, expect, it } from 'vitest'
import { identityFromToken } from './access-token.js'

const NOW = 1_700_000_000_000
const SOON = Math.floor(NOW / 1000) + 3600

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCodePoint(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')

const encode = (value: unknown): string =>
  toBase64Url(new TextEncoder().encode(JSON.stringify(value)))

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
])
const other = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
])

const keyFor = async (kid: string): Promise<CryptoKey | undefined> =>
  kid === 'key-1' ? pair.publicKey : undefined

/** Signs a token the way the service would. */
async function tokenOf(
  claims: Record<string, unknown>,
  options: { header?: Record<string, unknown>; signWith?: CryptoKey } = {},
): Promise<string> {
  const header = { alg: 'ES256', kid: 'key-1', ...options.header }
  const signed = `${encode(header)}.${encode(claims)}`
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    options.signWith ?? pair.privateKey,
    new TextEncoder().encode(signed),
  )

  return `${signed}.${toBase64Url(new Uint8Array(signature))}`
}

const valid = { sub: 'user-1', email: 'dex@example.test', exp: SOON }

describe('identityFromToken', () => {
  it('reads who a properly signed token belongs to', async () => {
    expect(await identityFromToken(await tokenOf(valid), keyFor, NOW)).toEqual({
      userId: 'user-1',
      email: 'dex@example.test',
    })
  })

  it('refuses a token signed by somebody else', async () => {
    const forged = await tokenOf(valid, { signWith: other.privateKey })
    expect(await identityFromToken(forged, keyFor, NOW)).toBeUndefined()
  })

  it('refuses a token whose payload was edited after signing', async () => {
    const token = await tokenOf(valid)
    const [header, , signature] = token.split('.')
    const tampered = `${header}.${encode({ ...valid, sub: 'somebody-else' })}.${signature}`

    expect(await identityFromToken(tampered, keyFor, NOW)).toBeUndefined()
  })

  /*
   * The classic JWT hole. A token that declares its own algorithm and is
   * believed verifies against anything — `none` most famously, but also a
   * symmetric algorithm checked against a public key everyone can read.
   */
  it.each(['none', 'HS256', 'RS256'])('refuses a token claiming alg %s', async (alg) => {
    const token = await tokenOf(valid, { header: { alg } })
    expect(await identityFromToken(token, keyFor, NOW)).toBeUndefined()
  })

  it('refuses a token signed with a key it cannot find', async () => {
    const token = await tokenOf(valid, { header: { kid: 'some-other-key' } })
    expect(await identityFromToken(token, keyFor, NOW)).toBeUndefined()
  })

  it('refuses a token that has expired', async () => {
    const expired = await tokenOf({ ...valid, exp: Math.floor(NOW / 1000) - 1 })
    expect(await identityFromToken(expired, keyFor, NOW)).toBeUndefined()
  })

  it('accepts one that expires in a moment, and refuses it a moment later', async () => {
    const exp = Math.floor(NOW / 1000) + 1
    const token = await tokenOf({ ...valid, exp })

    expect(await identityFromToken(token, keyFor, NOW)).not.toBeUndefined()
    expect(await identityFromToken(token, keyFor, exp * 1000)).toBeUndefined()
  })

  it('refuses a token with no expiry at all', async () => {
    const token = await tokenOf({ sub: 'user-1', email: 'dex@example.test' })
    expect(await identityFromToken(token, keyFor, NOW)).toBeUndefined()
  })

  it.each([
    ['not a jwt', 'nonsense'],
    ['two parts', 'a.b'],
    ['unreadable base64', '!!!.!!!.!!!'],
    ['empty', ''],
  ])('refuses %s', async (_what, token) => {
    expect(await identityFromToken(token, keyFor, NOW)).toBeUndefined()
  })

  it('refuses a token with a signature but no subject', async () => {
    const token = await tokenOf({ email: 'dex@example.test', exp: SOON })
    expect(await identityFromToken(token, keyFor, NOW)).toBeUndefined()
  })
})
