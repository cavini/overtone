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

  constructor(options: SupabaseIdentityOptions) {
    this.auth = `${options.projectUrl.replace(/\/+$/u, '')}/auth/v1`
    this.key = options.publishableKey
    this.fetch = options.fetch ?? globalThis.fetch
  }

  private headers(): Record<string, string> {
    return { apikey: this.key, 'content-type': 'application/json' }
  }

  /**
   * What went wrong, from a status code.
   *
   * `429` is its own code rather than folded into unavailable: the free tier
   * rate-limits sign-in emails hard, and "ask again in a minute" is a
   * different thing to say than "it is broken".
   */
  private static failureFor(status: number): IdentityFailure {
    if (status === 429) return { code: 'TOO_MANY_LINKS' }
    if (status === 400 || status === 401 || status === 403) return { code: 'LINK_EXPIRED' }
    if (status === 422) return { code: 'EMAIL_REJECTED' }
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

    if (!response.ok) return { ok: false, failure: SupabaseIdentityProvider.failureFor(response.status) }
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
      return { ok: false, failure: SupabaseIdentityProvider.failureFor(response.status) }
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

  /**
   * Asks the service who a token belongs to, rather than reading the token.
   *
   * A signature check here would be faster and would need the project's
   * signing secret on hand. This is one request on a page view, and it is
   * the service's own answer — including for a token that was valid and has
   * since been revoked, which a signature check would still accept.
   */
  async whoIs(accessToken: string): Promise<Identity | undefined> {
    let response: Response
    try {
      response = await this.fetch(`${this.auth}/user`, {
        headers: { ...this.headers(), authorization: `Bearer ${accessToken}` },
      })
    } catch {
      return undefined
    }

    if (!response.ok) return undefined

    const body = (await response.json().catch(() => ({}))) as { id?: unknown; email?: unknown }
    const userId = asString(body.id)
    const email = asString(body.email)

    return userId === undefined || email === undefined ? undefined : { userId, email }
  }
}
