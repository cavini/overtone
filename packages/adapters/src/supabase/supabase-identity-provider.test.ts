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

    /*
     * The whole path, with a key the stub really published and a token
     * really signed by it. The pieces are tested apart; this is the one
     * that proves they are wired to each other.
     */
    it('recognises a token signed by the key it published', async () => {
      const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
        'sign',
        'verify',
      ])
      const published = await crypto.subtle.exportKey('jwk', pair.publicKey)

      const b64 = (bytes: Uint8Array) =>
        btoa(String.fromCodePoint(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
      const part = (value: unknown) => b64(new TextEncoder().encode(JSON.stringify(value)))

      const signed = `${part({ alg: 'ES256', kid: 'live-key' })}.${part({
        sub: 'user-9',
        email: 'loen@example.test',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })}`
      const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        pair.privateKey,
        new TextEncoder().encode(signed),
      )

      const serving = answering(200, { keys: [{ ...published, kid: 'live-key' }] })
      const who = await provider(serving).whoIs(`${signed}.${b64(new Uint8Array(signature))}`)

      expect(who).toEqual({ userId: 'user-9', email: 'loen@example.test' })
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

describe('SupabaseIdentityProvider, with a password', () => {
  describe('signing in', () => {
    it('asks for a token with the password grant', async () => {
      const stub = answering(200, SESSION)
      await provider(stub).signIn('dex@example.test', 'uma senha comprida')

      const [url, init] = callTo(stub) ?? ['', {}]
      expect(url).toBe(`${PROJECT}/auth/v1/token?grant_type=password`)
      expect(JSON.parse(String(init.body))).toEqual({
        email: 'dex@example.test',
        password: 'uma senha comprida',
      })
    })

    it('hands back the session', async () => {
      const outcome = await provider(answering(200, SESSION)).signIn('dex@example.test', 'senha')

      if (!outcome.ok) throw new Error(`expected a session, got ${outcome.failure.code}`)
      expect(outcome.session.identity).toEqual({ userId: 'user-1', email: 'dex@example.test' })
    })

    /*
     * Not `LINK_EXPIRED`, which is what the shared mapper says for a 400
     * when redeeming a link. The service answers a wrong password and an
     * unknown address with the same 400, which is the behaviour the contract
     * wants — but calling it an expired link would put "ask for a new link"
     * in front of somebody who mistyped their password.
     */
    it('calls a refusal a wrong email or password', async () => {
      const outcome = await provider(
        answering(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' }),
      ).signIn('dex@example.test', 'errada')

      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.failure.code).toBe('WRONG_EMAIL_OR_PASSWORD')
    })

    it('says so when the service is unreachable', async () => {
      const outcome = await provider(
        vi.fn(() => Promise.reject(new Error('network'))) as unknown as typeof globalThis.fetch,
      ).signIn('dex@example.test', 'senha')

      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.failure.code).toBe('PROVIDER_UNAVAILABLE')
    })
  })

  describe('registering', () => {
    it('posts the address and password to signup', async () => {
      const stub = answering(200, SESSION)
      await provider(stub).register('dex@example.test', 'uma senha comprida')

      const [url, init] = callTo(stub) ?? ['', {}]
      expect(url).toBe(`${PROJECT}/auth/v1/signup`)
      expect(JSON.parse(String(init.body))).toEqual({
        email: 'dex@example.test',
        password: 'uma senha comprida',
      })
    })

    it('signs the new account straight in', async () => {
      const outcome = await provider(answering(200, SESSION)).register('dex@example.test', 'senha')

      if (!outcome.ok) throw new Error(`expected a session, got ${outcome.failure.code}`)
      expect(outcome.session.accessToken).toBe('access-abc')
    })

    it('reads an outright refusal as the address being taken', async () => {
      const outcome = await provider(
        answering(422, { code: 'user_already_exists', msg: 'User already registered' }),
      ).register('dex@example.test', 'senha')

      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.failure.code).toBe('EMAIL_TAKEN')
    })

    /*
     * The project's own anti-enumeration behaviour, and the reason this is
     * not just `response.ok`. With email confirmation switched on, signing
     * up an address that already exists is answered **200 with a user and
     * no session**, and `identities` empty is the only thing that says which
     * of the two happened.
     */
    it('reads a 200 with no session and no identities as taken', async () => {
      const outcome = await provider(
        answering(200, { id: 'user-1', email: 'dex@example.test', identities: [] }),
      ).register('dex@example.test', 'senha')

      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.failure.code).toBe('EMAIL_TAKEN')
    })

    /*
     * The same shape but with an identity on it is a genuinely new account
     * that the project will not let in until somebody clicks an email. That
     * is a setting, and the deployment this runs on wants it off — so the
     * refusal has to name it rather than look like a fault.
     */
    it('says the address needs confirming when that is what came back', async () => {
      const outcome = await provider(
        answering(200, {
          id: 'user-1',
          email: 'dex@example.test',
          identities: [{ id: 'identity-1' }],
        }),
      ).register('dex@example.test', 'senha')

      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.failure.code).toBe('EMAIL_NOT_CONFIRMED')
    })

    it('passes the service’s own password refusal through', async () => {
      const outcome = await provider(
        answering(422, { code: 'weak_password', msg: 'Password should be at least 6 characters' }),
      ).register('dex@example.test', 'curta')

      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.failure.code).toBe('PASSWORD_REJECTED')
    })
  })
})
