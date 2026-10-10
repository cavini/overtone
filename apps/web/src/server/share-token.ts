/**
 * How many random bytes a share token carries.
 *
 * The link is the whole permission — anybody holding it sees the episode's
 * numbers — so it has to be unguessable rather than merely unlikely.
 * Sixteen bytes is 128 bits, the same order as a session identifier, and
 * still short enough to paste into a chat.
 */
const TOKEN_BYTES = 16

/**
 * An unguessable name for a shared episode.
 *
 * Base64url, so it survives being a path segment, a chat message and a
 * double-click without being re-encoded or cut in half at a `+`.
 *
 * Random, never derived from the episode. A token computed from an id — a
 * hash, however long — is one somebody can recompute for an episode they
 * are guessing at, which makes every episode in the library reachable by
 * anybody who has seen one link.
 */
export function newShareToken(randomBytes: (size: number) => Uint8Array): string {
  const bytes = randomBytes(TOKEN_BYTES)

  return btoa(String.fromCodePoint(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

/**
 * Whether a string could be one of ours.
 *
 * Checked before it reaches the database — not for safety, which the
 * parameterised query already handles, but so a bot walking the URL space
 * costs a string comparison instead of a round trip.
 */
export function looksLikeShareToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/u.test(value)
}
