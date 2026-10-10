import { identityFromToken } from './access-token.js'
import type {
  Identity,
  IdentityFailure,
  IdentityProvider,
  LinkSent,
  Session,
  SignInOutcome,
} from '@overtone/core'

export interface SupabaseIdentityOptions {
  readonly projectUrl: string
  /** The publishable key. Safe in a browser, and all this endpoint needs. */
  readonly publishableKey: string
  readonly fetch?: typeof globalThis.fetch
}

/** What the service hands back when a sign-in works. */
interface TokenResponse {
  readonly access_token?: unknown
  readonly refresh_token?: unknown
  readonly expires_in?: unknown
  readonly user?: { readonly id?: unknown; readonly email?: unknown }
}

/**
 * A JSON Web Key, narrowed to what importing one needs.
 *
 * Spelled out rather than using the DOM's `JsonWebKey`, which is not in this
 * package's lib — and which is wider than anything here should accept.
 */
interface PublishedKey {
  readonly kty: string
  readonly crv: string
  readonly x: string
  readonly y: string
}

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined

/**
 * Sign-in through Supabase Auth, over its REST API.
 *
 * No SDK, for the same reason as the blob store and the transcriber: the
 * seam that makes this testable is an injected `fetch`, and a client would
 * hide it. There is nothing here that a client would do better — four
 * endpoints, each one request.
 *
 * The **publishable** key, never the secret one. These endpoints are the
 * ones a browser would call; handing them a key that bypasses row-level
 * security would be giving away far more than signing in needs.
 */
export class SupabaseIdentityProvider implements IdentityProvider {
  private readonly auth: string
  private readonly key: string
  private readonly fetch: typeof globalThis.fetch
  /** Signing keys, fetched once. They rotate rarely and are public. */
  private keys: Map<string, CryptoKey> | undefined

  constructor(options: SupabaseIdentityOptions) {
    this.auth = `${options.projectUrl.replace(/\/+$/u, '')}/auth/v1`
    this.key = options.publishableKey
    this.fetch = options.fetch ?? globalThis.fetch
  }

  private headers(): Record<string, string> {
    return { apikey: this.key, 'content-type': 'application/json' }
  }

  /**
   * What went wrong, from a status code and what was being attempted.
   *
   * The same 400 means different things on the two paths, and saying the
   * wrong one is worse than saying nothing: a mistyped address answered
   * with *"that link is no longer good"* sends somebody looking through
   * their inbox for a link that was never sent. Asking for a link can fail
   * because the address is unusable or the redirect is not allow-listed;
   * redeeming one fails because it is spent or expired.
   *
   * `429` is its own code either way — the free tier rate-limits sign-in
   * emails hard, and "ask again in a minute" is not "it is broken".
   */
  private static failureFor(status: number, doing: 'sending' | 'redeeming'): IdentityFailure {
    if (status === 429) return { code: 'TOO_MANY_LINKS' }
    if (status === 422) return { code: 'EMAIL_REJECTED' }

    if (status === 400 || status === 401 || status === 403) {
      return doing === 'sending' ? { code: 'EMAIL_REJECTED' } : { code: 'LINK_EXPIRED' }
    }

    return { code: 'PROVIDER_UNAVAILABLE' }
  }

  private static sessionFrom(body: TokenResponse): Session | undefined {
    const accessToken = asString(body.access_token)
    const refreshToken = asString(body.refresh_token)
    const userId = asString(body.user?.id)
    const email = asString(body.user?.email)

    if (accessToken === undefined || refreshToken === undefined) return undefined
    if (userId === undefined || email === undefined) return undefined

    const seconds = typeof body.expires_in === 'number' ? body.expires_in : 3600

    return {
      identity: { userId, email },
      accessToken,
      refreshToken,
      // A duration from the service, turned into an instant here. Storing the
      // duration would mean recomputing it against a clock that has moved.
      expiresAtMs: Date.now() + seconds * 1000,
    }
  }

  async sendLink(email: string, returnTo: string): Promise<LinkSent> {
    let response: Response
    try {
      response = await this.fetch(
        `${this.auth}/otp?redirect_to=${encodeURIComponent(returnTo)}`,
        {
          method: 'POST',
          headers: this.headers(),
          // A new address becomes an account. The group is small and the
          // gate on who may join is the invitation, not the sign-in form.
          body: JSON.stringify({ email, create_user: true }),
        },
      )
    } catch {
      return { ok: false, failure: { code: 'PROVIDER_UNAVAILABLE' } }
    }

    if (!response.ok) {
      // The body says which of the several 400s this is, and there is no
      // other way to find out from outside.
      console.error('could not send a sign-in link', response.status, await response.text().catch(() => ''))

      return { ok: false, failure: SupabaseIdentityProvider.failureFor(response.status, 'sending') }
    }

    return { ok: true }
  }

  private async exchange(path: string, body: unknown): Promise<SignInOutcome> {
    let response: Response
    try {
      response = await this.fetch(`${this.auth}${path}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
      })
    } catch {
      return { ok: false, failure: { code: 'PROVIDER_UNAVAILABLE' } }
    }

    if (!response.ok) {
      return { ok: false, failure: SupabaseIdentityProvider.failureFor(response.status, 'redeeming') }
    }

    const payload = (await response.json().catch(() => ({}))) as TokenResponse
    const session = SupabaseIdentityProvider.sessionFrom(payload)

    // A 200 whose body is not a session means the API changed under us.
    // Treating it as success would sign somebody in as nobody.
    if (session === undefined) return { ok: false, failure: { code: 'PROVIDER_UNAVAILABLE' } }

    return { ok: true, session }
  }

  redeem(tokenHash: string): Promise<SignInOutcome> {
    return this.exchange('/verify', { type: 'magiclink', token_hash: tokenHash })
  }

  renew(refreshToken: string): Promise<SignInOutcome> {
    return this.exchange('/token?grant_type=refresh_token', { refresh_token: refreshToken })
  }

  /** The public signing keys, fetched once and kept. */
  private async signingKeys(): Promise<Map<string, CryptoKey>> {
    if (this.keys !== undefined) return this.keys

    const loaded = new Map<string, CryptoKey>()
    try {
      const response = await this.fetch(`${this.auth}/.well-known/jwks.json`, {
        headers: this.headers(),
      })
      if (response.ok) {
        const body = (await response.json()) as { keys?: readonly Record<string, unknown>[] }
        for (const key of body.keys ?? []) {
          const kid = asString(key['kid'])
          // Only the curve this verifies. Importing anything else would
          // mean trusting an algorithm nothing here checked.
          if (kid === undefined || key['kty'] !== 'EC' || key['crv'] !== 'P-256') continue

          loaded.set(
            kid,
            await crypto.subtle.importKey(
              'jwk',
              key as unknown as PublishedKey,
              { name: 'ECDSA', namedCurve: 'P-256' },
              false,
              ['verify'],
            ),
          )
        }
      }
    } catch {
      // Left empty rather than cached, so the next request tries again.
      return loaded
    }

    // Only kept once something was actually loaded: caching an empty set
    // would turn one bad moment into everybody being signed out until the
    // instance recycled.
    if (loaded.size > 0) this.keys = loaded
    return loaded
  }

  /**
   * Who an access token belongs to, checked against the published key.
   *
   * Locally, not by asking the service. The alternative is a network round
   * trip on **every** request, and the transcript reader asks for more every
   * five seconds while an episode runs — one open tab would be twelve
   * sign-in checks a minute against a free tier.
   *
   * The cost is that a token stays good until it expires even if the session
   * was ended elsewhere. Sessions last an hour, and for a group of friends
   * that is the right trade.
   */
  async whoIs(accessToken: string): Promise<Identity | undefined> {
    const keys = await this.signingKeys()

    return identityFromToken(accessToken, (kid) => Promise.resolve(keys.get(kid)), Date.now())
  }
}
