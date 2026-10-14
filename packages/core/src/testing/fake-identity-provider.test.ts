// US-002 · each friend has their own library
import { describe, expect, it } from 'vitest'
import { FakeIdentityProvider } from './fake-identity-provider.js'
import { describeIdentityProvider } from './identity-provider.contract.js'

describeIdentityProvider('FakeIdentityProvider', () => {
  const provider = new FakeIdentityProvider()
  /*
   * A counter rather than `Math.random`, which `packages/core` does not get
   * to call. The contract asks for an address nothing has registered, and
   * each provider here is fresh, so counting from one is enough.
   */
  let made = 0

  return {
    provider,
    knownEmail: 'dex@example.test',
    tokenFor: (email: string) => Promise.resolve(provider.tokenFor(email)),
    freshEmail: () => {
      made += 1
      return `fresh-${String(made)}@example.test`
    },
  }
})

describe('FakeIdentityProvider', () => {
  it('tells two people apart', async () => {
    const provider = new FakeIdentityProvider()

    await provider.sendLink('dex@example.test', '/')
    const dex = await provider.redeem(provider.tokenFor('dex@example.test'))
    await provider.sendLink('loen@example.test', '/')
    const loen = await provider.redeem(provider.tokenFor('loen@example.test'))

    if (!dex.ok || !loen.ok) throw new Error('expected two sessions')
    expect(dex.session.identity.userId).not.toBe(loen.session.identity.userId)
  })

  it('renews a session without sending a second email', async () => {
    const provider = new FakeIdentityProvider()
    await provider.sendLink('dex@example.test', '/')
    const first = await provider.redeem(provider.tokenFor('dex@example.test'))
    if (!first.ok) throw new Error('expected a session')

    const renewed = await provider.renew(first.session.refreshToken)

    if (!renewed.ok) throw new Error('expected a renewed session')
    expect(renewed.session.identity).toEqual(first.session.identity)
    expect(renewed.session.accessToken).not.toBe(first.session.accessToken)
  })

  it('renews nothing from a made-up refresh token', async () => {
    const provider = new FakeIdentityProvider()
    expect((await provider.renew('not-a-refresh-token')).ok).toBe(false)
  })
})
