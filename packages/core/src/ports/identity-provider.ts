/** Somebody who has proved they can read an email address. */
export interface Identity {
  readonly userId: string
  readonly email: string
}

/** What a sign-in hands back, and what has to be kept to stay signed in. */
export interface Session {
  readonly identity: Identity
  readonly accessToken: string
  readonly refreshToken: string
  /** When the access token stops being accepted, in epoch milliseconds. */
  readonly expiresAtMs: number
}

/**
 * Why a sign-in did not happen.
 *
 * Codes rather than messages: no layer below the presenter knows which
 * language the reader wants (ADR 0017).
 */
export type IdentityFailure =
  | { readonly code: 'LINK_EXPIRED' }
  | { readonly code: 'LINK_ALREADY_USED' }
  | { readonly code: 'EMAIL_REJECTED' }
  /** Too many links asked for, too fast. The free tier is strict about this. */
  | { readonly code: 'TOO_MANY_LINKS' }
  | { readonly code: 'PROVIDER_UNAVAILABLE' }

export type SignInOutcome =
  | { readonly ok: true; readonly session: Session }
  | { readonly ok: false; readonly failure: IdentityFailure }

export type LinkSent = { readonly ok: true } | { readonly ok: false; readonly failure: IdentityFailure }

/**
 * Who somebody is, and how they proved it.
 *
 * A port because the alternative is auth code scattered through routes, and
 * auth is the one area where "scattered" and "wrong" are the same word. The
 * fake makes every other test able to be signed in without a network.
 */
export interface IdentityProvider {
  /**
   * Emails a one-time link.
   *
   * Never says whether the address is already known. An endpoint that
   * answers that question is an endpoint that lists the group's members to
   * anybody who asks.
   */
  sendLink(email: string, returnTo: string): Promise<LinkSent>
  /** Turns the token from a clicked link into a session. */
  redeem(tokenHash: string): Promise<SignInOutcome>
  /** Who an access token belongs to, or nobody. */
  whoIs(accessToken: string): Promise<Identity | undefined>
  /** A fresh access token, while the refresh token is still good. */
  renew(refreshToken: string): Promise<SignInOutcome>
}
