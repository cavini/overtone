/**
 * One shared password, which is the whole access model for now.
 *
 * Not about privacy — the group's episodes are not secret to each other. It
 * is about the **allowance**: `/api/episodes` spends seconds of audio from
 * one free-tier budget that every user of the app shares, three episodes a
 * day between them (ADR 0020). An open upload endpoint on a public URL is a
 * stranger emptying it.
 *
 * Accounts arrive in M1. Until then this is the smallest thing that stops
 * that, and the roadmap says so in as many words.
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
