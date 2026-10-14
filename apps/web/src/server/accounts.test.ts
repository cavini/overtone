// US-052 · an account is an email and a password
import type { IdentityFailure, IdentityProvider } from '@overtone/core'
import { FakeIdentityProvider } from '@overtone/core/testing'
import { describe, expect, it } from 'vitest'
import { registerAccount, signInWithPassword } from './accounts.js'

const LIST = 'dex@example.test, loen@example.test'
const PASSWORD = 'uma senha comprida'

const fresh = () => new FakeIdentityProvider()

/**
 * A provider that refuses with a code of its choosing.
 *
 * The fake answers an unknown address and a wrong password identically,
 * because the contract makes it — so it cannot show whether this module
 * flattens a *more specific* refusal. The real service has several, and one
 * of them reaching the form is the membership leak this is here to stop.
 */
const refusing = (code: IdentityFailure['code']): IdentityProvider => ({
  sendLink: () => Promise.resolve({ ok: true }),
  redeem: () => Promise.resolve({ ok: false, failure: { code } }),
  register: () => Promise.resolve({ ok: false, failure: { code } }),
  signIn: () => Promise.resolve({ ok: false, failure: { code } }),
  whoIs: () => Promise.resolve(undefined),
  renew: () => Promise.resolve({ ok: false, failure: { code } }),
})

describe('registering', () => {
  it('makes an account for an invited address and signs it in', async () => {
    const outcome = await registerAccount(fresh(), 'dex@example.test', PASSWORD, LIST)

    if (!outcome.ok) throw new Error(`expected a session, got ${outcome.code}`)
    expect(outcome.session.identity.email).toBe('dex@example.test')
  })

  /*
   * The whole reason the list exists. Uploading spends seconds of audio from
   * one free-tier budget shared by everybody (ADR 0020), so an open
   * registration form is that budget published to the internet.
   */
  it('refuses an address nobody invited', async () => {
    const outcome = await registerAccount(fresh(), 'stranger@example.test', PASSWORD, LIST)

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.code).toBe('EMAIL_REJECTED')
  })

  /*
   * Fail closed, unlike `isInvited`, whose unset-means-anybody is right for
   * signing in to an account that already exists and wrong for making one.
   * A deployment with no list would otherwise hand out accounts — and the
   * allowance behind them — to whoever found the URL.
   */
  it('refuses everybody when no list is set at all', async () => {
    const outcome = await registerAccount(fresh(), 'dex@example.test', PASSWORD, undefined)

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.code).toBe('EMAIL_REJECTED')
  })

  it('refuses a password too short to be one', async () => {
    const outcome = await registerAccount(fresh(), 'dex@example.test', 'curta', LIST)

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.code).toBe('PASSWORD_TOO_SHORT')
  })

  // Checked here, so the address never reaches the service at all: a
  // refusal we can make ourselves is one request the free tier keeps.
  it('does not ask the service about a password it has already refused', async () => {
    const provider = fresh()
    await registerAccount(provider, 'dex@example.test', 'curta', LIST)

    expect((await signInWithPassword(provider, 'dex@example.test', 'curta', LIST)).ok).toBe(false)
  })

  it('will not make a second account for one address', async () => {
    const provider = fresh()
    await registerAccount(provider, 'dex@example.test', PASSWORD, LIST)

    const again = await registerAccount(provider, 'dex@example.test', PASSWORD, LIST)

    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.code).toBe('EMAIL_TAKEN')
  })

  it('does not care how the address was capitalised', async () => {
    const outcome = await registerAccount(fresh(), '  DEX@Example.test ', PASSWORD, LIST)

    if (!outcome.ok) throw new Error(`expected a session, got ${outcome.code}`)
    // Stored lower case and trimmed, or the same person gets a second
    // library the next time they type it differently.
    expect(outcome.session.identity.email).toBe('dex@example.test')
  })
})

describe('signing in', () => {
  it('lets an invited account in with its own password', async () => {
    const provider = fresh()
    await registerAccount(provider, 'dex@example.test', PASSWORD, LIST)

    const outcome = await signInWithPassword(provider, 'dex@example.test', PASSWORD, LIST)

    if (!outcome.ok) throw new Error(`expected a session, got ${outcome.code}`)
    expect(outcome.session.identity.email).toBe('dex@example.test')
  })

  it('refuses the wrong password', async () => {
    const provider = fresh()
    await registerAccount(provider, 'dex@example.test', PASSWORD, LIST)

    const outcome = await signInWithPassword(provider, 'dex@example.test', 'outra comprida', LIST)

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.code).toBe('WRONG_EMAIL_OR_PASSWORD')
  })

  /*
   * The same refusal for an address with no account, for one that was never
   * invited, and for a wrong password. Three different answers would make
   * this form a way of asking who is in the group.
   */
  it('refuses an unknown address, an uninvited one and a wrong password alike', async () => {
    const provider = fresh()
    await registerAccount(provider, 'dex@example.test', PASSWORD, LIST)

    const answers = await Promise.all([
      signInWithPassword(provider, 'dex@example.test', 'errada comprida', LIST),
      signInWithPassword(provider, 'nobody@example.test', PASSWORD, LIST),
      signInWithPassword(provider, 'stranger@example.test', PASSWORD, LIST),
    ])

    expect(answers.map((answer) => (answer.ok ? 'in' : answer.code))).toEqual([
      'WRONG_EMAIL_OR_PASSWORD',
      'WRONG_EMAIL_OR_PASSWORD',
      'WRONG_EMAIL_OR_PASSWORD',
    ])
  })

  /*
   * Taking somebody off the list locks them out, rather than leaving an
   * account that outlives the invitation that allowed it.
   */
  it('refuses an account whose address has left the list', async () => {
    const provider = fresh()
    await registerAccount(provider, 'dex@example.test', PASSWORD, LIST)

    const outcome = await signInWithPassword(
      provider,
      'dex@example.test',
      PASSWORD,
      'loen@example.test',
    )

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.code).toBe('WRONG_EMAIL_OR_PASSWORD')
  })

  /*
   * Flattened, whatever the service said. These are codes the real adapter
   * can return and the fake cannot — `EMAIL_REJECTED` for an address the
   * service will not take, `EMAIL_TAKEN` from a signup path — and any of
   * them reaching the form tells somebody that the address is known here.
   */
  it.each(['EMAIL_REJECTED', 'EMAIL_TAKEN', 'LINK_EXPIRED', 'PASSWORD_REJECTED'] as const)(
    'answers %s as a wrong email or password',
    async (code) => {
      const outcome = await signInWithPassword(
        refusing(code),
        'dex@example.test',
        PASSWORD,
        LIST,
      )

      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.code).toBe('WRONG_EMAIL_OR_PASSWORD')
    },
  )

  /*
   * The one exception, and it is not about this person: a service that is
   * down should say so rather than tell somebody their password is wrong.
   */
  it('says the service is unavailable when it is', async () => {
    const outcome = await signInWithPassword(
      refusing('PROVIDER_UNAVAILABLE'),
      'dex@example.test',
      PASSWORD,
      LIST,
    )

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.code).toBe('PROVIDER_UNAVAILABLE')
  })

  // Unlike registering: an unset list is the fresh-checkout bargain, and
  // signing in needs an account that something already made.
  it('allows an existing account when no list is set', async () => {
    const provider = fresh()
    await registerAccount(provider, 'dex@example.test', PASSWORD, LIST)

    expect((await signInWithPassword(provider, 'dex@example.test', PASSWORD, undefined)).ok).toBe(
      true,
    )
  })
})
