import type { Identity } from '@overtone/core'

/** One signing key, as the service publishes it. */
export interface SigningKey {
  readonly kid?: unknown
  readonly alg?: unknown
  readonly kty?: unknown
  readonly crv?: unknown
}

const base64UrlToBytes = (value: string): Uint8Array<ArrayBuffer> => {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='))

  // Allocated here rather than through `Uint8Array.from`, which types as
  // `ArrayBufferLike` and so could be shared memory — which WebCrypto will
  // not take.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.codePointAt(at) ?? 0

  return bytes
}

interface Claims {
  readonly sub?: unknown
  readonly email?: unknown
  readonly exp?: unknown
}

/**
 * Who an access token says it belongs to, if its signature holds.
 *
 * Checked here rather than by asking the service, because the alternative is
 * a network round trip on **every** request — and the transcript reader asks
 * for more every five seconds while an episode is running. One open tab
 * would be twelve sign-in checks a minute against a free tier.
 *
 * The cost of checking locally is that a token stays good until it expires,
 * even if the session was ended elsewhere. Sessions last an hour; for a
 * group of friends that is the right trade, and it is how a JWT is meant to
 * be read.
 *
 * Returns nobody for anything it cannot prove: a bad signature, a missing
 * key, an unexpected algorithm, an expired token, a malformed one. There is
 * no path here that answers "probably".
 */
export async function identityFromToken(
  token: string,
  keyFor: (kid: string) => Promise<CryptoKey | undefined>,
  nowMs: number,
): Promise<Identity | undefined> {
  const parts = token.split('.')
  if (parts.length !== 3) return undefined

  const [rawHeader, rawPayload, rawSignature] = parts as [string, string, string]

  let header: { alg?: unknown; kid?: unknown }
  let claims: Claims
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(rawHeader)))
    claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(rawPayload)))
  } catch {
    return undefined
  }

  /*
   * The algorithm is pinned, not read and obeyed.
   *
   * Taking it from the header is the classic JWT hole: a token claiming
   * `alg: none`, or a symmetric algorithm verified against a public key,
   * then verifies against anything.
   */
  if (header.alg !== 'ES256') return undefined
  if (typeof header.kid !== 'string') return undefined

  const key = await keyFor(header.kid)
  if (key === undefined) return undefined

  const signed = new TextEncoder().encode(`${rawHeader}.${rawPayload}`)
  const verified = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    base64UrlToBytes(rawSignature),
    signed,
  )
  if (!verified) return undefined

  // Seconds in the token, milliseconds everywhere in this codebase.
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= nowMs) return undefined

  const userId = typeof claims.sub === 'string' ? claims.sub : undefined
  const email = typeof claims.email === 'string' ? claims.email : undefined

  return userId === undefined || email === undefined ? undefined : { userId, email }
}
