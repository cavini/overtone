/**
 * One shared password, which is the access model (ADR 0028).
 *
 * Magic-link sign-in is built and dormant beside it. Turning that on needs
 * an email provider — Supabase's own sender only reliably reaches the
 * project owner, so friends would never receive a link — and the group is
 * four people who are content sharing one password. "One login everybody
 * shares" and "magic link" are different things anyway: a link arrives in
 * somebody's inbox, and whoever owns that inbox is the account.
 *
 * So this is **not scaffolding awaiting removal**. It is off only when
 * `OVERTONE_PASSWORD` is unset, and whoever holds it is the owner of the
 * one library. Everything behind it — per-user scoping, ownership checks,
 * the isolation suite — is already in place and starts applying the day
 * sign-in is switched on.
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
