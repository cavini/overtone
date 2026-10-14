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
  /**
   * Expired, spent, or never ours — the three are one answer.
   *
   * There was a separate `LINK_ALREADY_USED`, and nothing could ever
   * produce it: the service answers a reused link and an expired one with
   * the same status, so telling them apart would have meant inventing the
   * difference. A code nothing emits is a case nothing tests.
   */
  | { readonly code: 'LINK_EXPIRED' }
  | { readonly code: 'EMAIL_REJECTED' }
  /** Too many links asked for, too fast. The free tier is strict about this. */
  | { readonly code: 'TOO_MANY_LINKS' }
  /**
   * The address and the password do not go together.
   *
   * One code for "no such account" and "wrong password" both, deliberately.
   * Telling them apart turns the sign-in form into a way of asking whether
   * somebody has an account here — the same reason `sendLink` never says
   * whether it recognised an address.
   */
  | { readonly code: 'WRONG_EMAIL_OR_PASSWORD' }
  /** Already registered. Only reachable behind the invitation list. */
  | { readonly code: 'EMAIL_TAKEN' }
  /** The service refused the password for its own reasons. */
  | { readonly code: 'PASSWORD_REJECTED' }
  /**
   * The account was made but the project will not let it in yet.
   *
   * A project setting, not a fault: with email confirmation switched on,
   * signing up returns a user and no session and nobody can enter until a
   * link is clicked. Named rather than folded into `PROVIDER_UNAVAILABLE`,
   * so the answer can say which setting to change.
   */
  | { readonly code: 'EMAIL_NOT_CONFIRMED' }
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
  /**
   * Creates an account and signs it straight in.
   *
   * Signed in rather than "now go and sign in", because an account made and
   * not entered is a password somebody has already half-forgotten.
   *
   * Who may call this is not this port's business — the invitation list is
   * checked above it. A provider that refused unknown addresses here could
   * not be tested without one.
   */
  register(email: string, password: string): Promise<SignInOutcome>
  /**
   * Signs in with a password.
   *
   * Refuses an unknown address and a wrong password identically; see
   * `WRONG_EMAIL_OR_PASSWORD`.
   */
  signIn(email: string, password: string): Promise<SignInOutcome>
  /** Turns the token from a clicked link into a session. */
  redeem(tokenHash: string): Promise<SignInOutcome>
  /** Who an access token belongs to, or nobody. */
  whoIs(accessToken: string): Promise<Identity | undefined>
  /** A fresh access token, while the refresh token is still good. */
  renew(refreshToken: string): Promise<SignInOutcome>
}
