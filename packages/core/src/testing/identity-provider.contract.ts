import { describe, expect, it } from 'vitest'
import type { IdentityProvider } from '../ports/identity-provider.js'

export interface IdentityUnderTest {
  readonly provider: IdentityProvider
  /** An address the provider will send to. */
  readonly knownEmail: string
  /** Hands back the token a clicked link would carry, for that address. */
  readonly tokenFor: (email: string) => Promise<string>
}

/**
 * The contract every `IdentityProvider` must satisfy, fake and real alike.
 *
 * The whole suite signs in through the fake. A fake that is more forgiving
 * than the real adapter — accepting a spent token, say — makes every test
 * that depends on being signed in pass for a reason production does not
 * share.
 */
export function describeIdentityProvider(
  name: string,
  create: () => IdentityUnderTest | Promise<IdentityUnderTest>,
): void {
  describe(`${name} (identity provider contract)`, () => {
    it('sends a link to an address', async () => {
      const { provider, knownEmail } = await create()
      expect(await provider.sendLink(knownEmail, 'https://example.test/callback')).toEqual({
        ok: true,
      })
    })

    it('turns a clicked link into a session', async () => {
      const { provider, knownEmail, tokenFor } = await create()
      await provider.sendLink(knownEmail, 'https://example.test/callback')

      const outcome = await provider.redeem(await tokenFor(knownEmail))

      if (!outcome.ok) throw new Error(`expected a session, got ${outcome.failure.code}`)
      expect(outcome.session.identity.email).toBe(knownEmail)
      expect(outcome.session.identity.userId.length).toBeGreaterThan(0)
      expect(outcome.session.expiresAtMs).toBeGreaterThan(0)
    })

    it('gives the same person the same id next time', async () => {
      const { provider, knownEmail, tokenFor } = await create()

      await provider.sendLink(knownEmail, 'https://example.test/callback')
      const first = await provider.redeem(await tokenFor(knownEmail))
      await provider.sendLink(knownEmail, 'https://example.test/callback')
      const second = await provider.redeem(await tokenFor(knownEmail))

      if (!first.ok || !second.ok) throw new Error('expected two sessions')
      expect(second.session.identity.userId).toBe(first.session.identity.userId)
    })

    /*
     * A link in an inbox is a password that does not expire unless something
     * makes it. Mailboxes get forwarded, archived and breached.
     */
    it('refuses a token that has already been used', async () => {
      const { provider, knownEmail, tokenFor } = await create()
      await provider.sendLink(knownEmail, 'https://example.test/callback')
      const token = await tokenFor(knownEmail)

      expect((await provider.redeem(token)).ok).toBe(true)

      const again = await provider.redeem(token)
      expect(again.ok).toBe(false)
    })

    it('refuses a token it never issued', async () => {
      const { provider } = await create()
      const outcome = await provider.redeem('not-a-token-this-service-ever-made')

      expect(outcome.ok).toBe(false)
    })

    it('recognises the holder of an access token', async () => {
      const { provider, knownEmail, tokenFor } = await create()
      await provider.sendLink(knownEmail, 'https://example.test/callback')
      const outcome = await provider.redeem(await tokenFor(knownEmail))

      if (!outcome.ok) throw new Error('expected a session')
      expect(await provider.whoIs(outcome.session.accessToken)).toEqual(outcome.session.identity)
    })

    it('recognises nobody from a made-up access token', async () => {
      const { provider } = await create()
      expect(await provider.whoIs('not-an-access-token')).toBeUndefined()
    })
  })
}
