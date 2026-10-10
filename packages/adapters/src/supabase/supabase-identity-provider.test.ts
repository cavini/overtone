// US-002 · each friend has their own library
import { describe, expect, it, vi } from 'vitest'
import { SupabaseIdentityProvider } from './supabase-identity-provider.js'

const PROJECT = 'https://project.supabase.co'
const SESSION = {
  access_token: 'access-abc',
  refresh_token: 'refresh-abc',
  expires_in: 3600,
  user: { id: 'user-1', email: 'dex@example.test' },
}

const answering = (status: number, body: unknown = {}) =>
  vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })),
  ) as unknown as typeof globalThis.fetch

const provider = (fetchImpl: typeof globalThis.fetch) =>
  new SupabaseIdentityProvider({
    projectUrl: PROJECT,
    publishableKey: 'sb_publishable_test',
    fetch: fetchImpl,
  })

const callTo = (stub: ReturnType<typeof answering>) =>
  (stub as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]

describe('SupabaseIdentityProvider', () => {
  describe('sending a link', () => {
    it('asks the service to email one, and says where to come back to', async () => {
      const stub = answering(200)
      await provider(stub).sendLink('dex@example.test', 'https://app.test/auth/callback')

      const [url, init] = callTo(stub) ?? ['', {}]
      expect(url).toContain(`${PROJECT}/auth/v1/otp`)
      expect(url).toContain(encodeURIComponent('https://app.test/auth/callback'))
      expect(JSON.parse(String(init.body))).toEqual({
        email: 'dex@example.test',
        create_user: true,
      })
    })

    /*
     * The publishable key, never the secret one. These are the endpoints a
     * browser would call, and the secret key bypasses row-level security
     * entirely — sending it here would hand out far more than signing in
     * needs.
     */
    it('authenticates with the publishable key and never the secret one', async () => {
      const stub = answering(200)
      await provider(stub).sendLink('dex@example.test', '/')

      const headers = (callTo(stub)?.[1].headers ?? {}) as Record<string, string>
      expect(headers['apikey']).toBe('sb_publishable_test')
      expect(JSON.stringify(headers)).not.toContain('secret')
    })

    // The free tier rate-limits sign-in emails hard, and "try again shortly"
    // is a different thing to tell someone than "it is broken".
    it('reports being rate-limited as its own thing', async () => {
      const outcome = await provider(answering(429)).sendLink('dex@example.test', '/')
      expect(outcome).toEqual({ ok: false, failure: { code: 'TOO_MANY_LINKS' } })
    })

    it('reports an address the service will not take', async () => {
      const outcome = await provider(answering(422)).sendLink('not-an-address', '/')
      expect(outcome).toEqual({ ok: false, failure: { code: 'EMAIL_REJECTED' } })
    })

    /*
     * The same 400 means different things on the two paths. Answering a
     * mistyped address with "that link is no longer good" sends somebody
     * hunting their inbox for a link that was never sent.
     */
    it('reads a plain refusal as a bad address, not an expired link', async () => {
      const outcome = await provider(answering(400)).sendLink('not-an-address', '/')
      expect(outcome).toEqual({ ok: false, failure: { code: 'EMAIL_REJECTED' } })
    })

    it('survives the service being unreachable', async () => {
      const dead = vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof globalThis.fetch
      expect(await provider(dead).sendLink('dex@example.test', '/')).toEqual({
        ok: false,
        failure: { code: 'PROVIDER_UNAVAILABLE' },
      })
    })
  })

  describe('redeeming a clicked link', () => {
    it('turns the token into a session', async () => {
      const outcome = await provider(answering(200, SESSION)).redeem('token-hash-1')

      if (!outcome.ok) throw new Error('expected a session')
      expect(outcome.session.identity).toEqual({ userId: 'user-1', email: 'dex@example.test' })
      expect(outcome.session.accessToken).toBe('access-abc')
      expect(outcome.session.expiresAtMs).toBeGreaterThan(Date.now())
    })

    it('sends the token as a magic link, which is the kind we issue', async () => {
      const stub = answering(200, SESSION)
      await provider(stub).redeem('token-hash-1')

      expect(JSON.parse(String(callTo(stub)?.[1].body))).toEqual({
        type: 'magiclink',
        token_hash: 'token-hash-1',
      })
    })

    it('refuses a token the service rejects', async () => {
      const outcome = await provider(answering(401)).redeem('spent')
      expect(outcome).toEqual({ ok: false, failure: { code: 'LINK_EXPIRED' } })
    })

    /*
     * A 200 whose body is not a session means the API changed under us.
     * Treating it as a success would sign somebody in as nobody, which is
     * worse than refusing.
     */
    it('refuses a success that does not contain a session', async () => {
      const outcome = await provider(answering(200, { access_token: 'only-half' })).redeem('t')
      expect(outcome).toEqual({ ok: false, failure: { code: 'PROVIDER_UNAVAILABLE' } })
    })
  })

  describe('recognising a token holder', () => {
    /*
     * Checked against the published signing key rather than by asking the
     * service, because the alternative is a round trip on every request —
     * and the transcript reader asks again every five seconds. The signature
     * checking itself is covered in `access-token.test.ts`; what matters
     * here is that the keys are fetched, and fetched once.
     */
    const jwks = {
      keys: [
        {
          kid: 'key-1',
          kty: 'EC',
          crv: 'P-256',
          alg: 'ES256',
          use: 'sig',
          x: 'XRAybxBq99i9dTDzs_jQQWZN5fkX8v7u5YvdvuRX_vI',
          y: 'wzA5IuSNABSf1RyKlQ3w7KFuZPJu52eQ_QxnEhOm9xw',
        },
      ],
    }

    it('fetches the published keys rather than asking about the token', async () => {
      const stub = answering(200, jwks)
      await provider(stub).whoIs('not.a.real-token')

      expect(callTo(stub)?.[0]).toContain('/auth/v1/.well-known/jwks.json')
    })

    it('fetches them once, however many tokens it is shown', async () => {
      const stub = answering(200, jwks)
      const one = provider(stub)
      await one.whoIs('a.b.c')
      await one.whoIs('d.e.f')

      expect((stub as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1)
    })

    it('answers with nobody for something that is not a token at all', async () => {
      expect(await provider(answering(200, jwks)).whoIs('made-up')).toBeUndefined()
    })

    // Caching an empty set would sign everybody out until the instance
    // recycled, for one bad moment.
    it('does not remember an empty answer', async () => {
      const stub = answering(500, {})
      const one = provider(stub)
      await one.whoIs('a.b.c')
      await one.whoIs('a.b.c')

      expect((stub as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(2)
    })

    it('answers with nobody rather than throwing when the service is down', async () => {
      const dead = vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof globalThis.fetch
      expect(await provider(dead).whoIs('a.b.c')).toBeUndefined()
    })
  })

  describe('renewing', () => {
    it('trades a refresh token for a new session', async () => {
      const stub = answering(200, SESSION)
      const outcome = await provider(stub).renew('refresh-abc')

      expect(callTo(stub)?.[0]).toContain('grant_type=refresh_token')
      if (!outcome.ok) throw new Error('expected a session')
      expect(outcome.session.accessToken).toBe('access-abc')
    })

    it('refuses a refresh token the service has retired', async () => {
      expect((await provider(answering(400)).renew('old')).ok).toBe(false)
    })
  })
})
