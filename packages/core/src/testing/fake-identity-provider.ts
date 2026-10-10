import type {
  Identity,
  IdentityProvider,
  LinkSent,
  Session,
  SignInOutcome,
} from '../ports/identity-provider.js'

/** An hour, which is what the real service hands out. */
const SESSION_MS = 3_600_000

/**
 * Signs people in without a network or an inbox.
 *
 * Every test that needs somebody signed in uses this, so it has to be as
 * strict as the real thing about the two things that matter: a token works
 * once, and the same address is always the same person.
 */
export class FakeIdentityProvider implements IdentityProvider {
  private readonly idByEmail = new Map<string, string>()
  private readonly pending = new Map<string, string>()
  private readonly live = new Map<string, Identity>()
  private readonly owners = new Map<string, string>()
  private issued = 0

  /** The token the email would have carried. Tests reach for this. */
  tokenFor(email: string): string {
    const token = this.pending.get(email)
    if (token === undefined) throw new Error(`no link was sent to ${email}`)
    return token
  }

  private identityFor(email: string): Identity {
    const existing = this.idByEmail.get(email)
    if (existing !== undefined) return { userId: existing, email }

    // Stable and obviously fake, so a test asserting on one reads clearly.
    const ordinal = String(this.idByEmail.size + 1).padStart(12, '0')
    const userId = `00000000-0000-4000-8000-${ordinal}`
    this.idByEmail.set(email, userId)
    return { userId, email }
  }

  private start(identity: Identity): Session {
    this.issued += 1
    const accessToken = `fake-access-${this.issued}`
    const refreshToken = `fake-refresh-${this.issued}`
    this.live.set(accessToken, identity)
    this.owners.set(refreshToken, identity.email)

    return { identity, accessToken, refreshToken, expiresAtMs: SESSION_MS }
  }

  sendLink(email: string, _returnTo: string): Promise<LinkSent> {
    this.issued += 1
    this.pending.set(email, `fake-link-${this.issued}`)
    return Promise.resolve({ ok: true })
  }

  redeem(tokenHash: string): Promise<SignInOutcome> {
    const found = [...this.pending.entries()].find(([, token]) => token === tokenHash)
    if (found === undefined) {
      return Promise.resolve({ ok: false, failure: { code: 'LINK_EXPIRED' } })
    }

    // Spent. A link sitting in an inbox is a password, and this is the only
    // thing that stops it being a permanent one.
    const [email] = found
    this.pending.delete(email)

    return Promise.resolve({ ok: true, session: this.start(this.identityFor(email)) })
  }

  whoIs(accessToken: string): Promise<Identity | undefined> {
    return Promise.resolve(this.live.get(accessToken))
  }

  renew(refreshToken: string): Promise<SignInOutcome> {
    const email = this.owners.get(refreshToken)
    if (email === undefined) {
      return Promise.resolve({ ok: false, failure: { code: 'LINK_EXPIRED' } })
    }

    return Promise.resolve({ ok: true, session: this.start(this.identityFor(email)) })
  }
}
