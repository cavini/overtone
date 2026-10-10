/**
 * The shared password, kept only so the cutover to accounts is not an
 * outage.
 *
 * Accounts replaced this (ADR 0028), but switching over needs three things
 * done by hand in the Supabase dashboard — Site URL, the callback in the
 * redirect allow-list, and real SMTP — and until they are done nobody can
 * sign in at all. Deleting this would have taken the app down for however
 * long that took.
 *
 * **It is off unless `OVERTONE_PASSWORD` is set.** Whoever holds it is
 * treated as the owner of the library from before accounts, so the group's
 * existing episodes keep reading exactly as they did. Unset the variable
 * and this disappears; nothing else refers to it.
 */

const encoder = new TextEncoder()

/**
 * What the cookie holds: a hash of the password, never the password.
 *
 * A browser carries this value around and anything that reads a cookie jar
 * can see it. It must not be possible to recover the shared secret from it.
 */
export async function tokenFor(password: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`overtone:${password}`))

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Compares in constant time.
 *
 * A comparison that stops at the first wrong character leaks how many were
 * right, which is enough to find the rest one at a time.
 */
export function matches(given: string | undefined | null, expected: string): boolean {
  if (typeof given !== 'string' || given.length !== expected.length) return false

  let difference = 0
  for (let index = 0; index < expected.length; index += 1) {
    difference |= given.charCodeAt(index) ^ expected.charCodeAt(index)
  }

  return difference === 0
}

/** The name the cookie goes by. */
export const GATE_COOKIE = 'overtone_entry'
