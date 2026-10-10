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
    it('answers with who it belongs to', async () => {
      const stub = answering(200, { id: 'user-1', email: 'dex@example.test' })
      expect(await provider(stub).whoIs('access-abc')).toEqual({
        userId: 'user-1',
        email: 'dex@example.test',
      })
      const headers = (callTo(stub)?.[1].headers ?? {}) as Record<string, string>
      expect(headers['authorization']).toBe('Bearer access-abc')
    })

    it('answers with nobody for a token the service does not know', async () => {
      expect(await provider(answering(401)).whoIs('made-up')).toBeUndefined()
    })

    it('answers with nobody rather than throwing when the service is down', async () => {
      const dead = vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof globalThis.fetch
      expect(await provider(dead).whoIs('access-abc')).toBeUndefined()
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
