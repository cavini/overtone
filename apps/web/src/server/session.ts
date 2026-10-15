import type { Identity, Session } from '@overtone/core'
import { cookies } from 'next/headers'
import { ACCESS_COOKIE, REFRESH_COOKIE } from './session-cookies.js'
import { NotYours } from './analyse-upload.js'
import { identityProvider } from './wiring.js'

/** Where the tokens live. Both httpOnly — no script ever needs to read them. */
export { ACCESS_COOKIE, REFRESH_COOKIE } from './session-cookies.js'

/**
 * A month.
 *
 * The cookie outlives the access token inside it on purpose: the access
 * token is good for an hour and is renewed silently from the refresh token,
 * so this is how long somebody stays signed in without touching their inbox
 * again. Sign-in emails are rate-limited on the free tier, which makes a
 * short session actively expensive.
 */
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  // Lax rather than strict: the sign-in link arrives from an email client,
  // and strict would drop the cookie on exactly that navigation.
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: COOKIE_MAX_AGE_SECONDS,
} as const

/** Writes a session into the cookie jar. */
export async function keepSignedIn(session: Session): Promise<void> {
  const jar = await cookies()
  jar.set(ACCESS_COOKIE, session.accessToken, cookieOptions)
  jar.set(REFRESH_COOKIE, session.refreshToken, cookieOptions)
}

/** Forgets whoever was signed in. */
export async function signOut(): Promise<void> {
  const jar = await cookies()
  jar.delete(ACCESS_COOKIE)
  jar.delete(REFRESH_COOKIE)
}

/**
 * Who is making this request, or nobody.
 *
 * Renews silently when the access token has expired and the refresh token
 * has not. Without that, everybody is signed out every hour — and signing
 * back in costs an email that the free tier rations.
 *
 * Writing cookies is not allowed from every kind of request Next.js serves,
 * so the renewal is attempted and its failure ignored: the session is still
 * returned, and the next request that *can* write will persist it.
 */
export async function currentUser(): Promise<Identity | undefined> {
  const jar = await cookies()
  const provider = identityProvider()

  const accessToken = jar.get(ACCESS_COOKIE)?.value
  if (accessToken !== undefined) {
    const identity = await provider.whoIs(accessToken)
    if (identity !== undefined) return identity
  }

  const refreshToken = jar.get(REFRESH_COOKIE)?.value
  if (refreshToken === undefined) return undefined

  const renewed = await provider.renew(refreshToken)
  if (!renewed.ok) return undefined

  try {
    await keepSignedIn(renewed.session)
  } catch {
    // A render that may not set cookies. The session is still good for this
    // request, and the next one that can write will keep it.
  }

  return renewed.session.identity
}

/**
 * Who is making this request, or an error.
 *
 * For the routes that read and write a group's episodes. Every one of them
 * must go through this or through `currentUser` — the scoping of what they
 * can see hangs off the identity it returns, so a route that skips it is a
 * route with no scope at all.
 */
export async function requireUser(): Promise<Identity> {
  const identity = await currentUser()
  if (identity === undefined) throw new NotSignedIn()

  return identity
}

/** Thrown by `requireUser`, caught at the route edge and turned into a 401. */
export class NotSignedIn extends Error {
  constructor() {
    super('not signed in')
    this.name = 'NotSignedIn'
  }
}

/**
 * The refusals the server layer throws, as statuses.
 *
 * `undefined` for anything else, so a route can fall through to its own
 * handling and a genuine fault still reads as one.
 */
export function refusal(error: unknown): Response | undefined {
  if (error instanceof NotSignedIn) {
    return Response.json({ error: 'NOT_SIGNED_IN' }, { status: 401 })
  }

  /*
   * A 404, not a 403.
   *
   * Whether somebody else's episode exists is not this caller's business
   * either — telling them apart turns a guessed id into a way to find out
   * what the other libraries hold.
   */
  if (error instanceof NotYours) {
    return Response.json({ error: 'NOT_FOUND' }, { status: 404 })
  }

  return undefined
}
