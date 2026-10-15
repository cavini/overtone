/**
 * Where the session lives, as two names and nothing else.
 *
 * Its own module because the backfill tool needs these names too, and
 * `session.ts` imports `next/headers` — pulling that into a Node CLI drags a
 * framework in behind it. A second copy of the names in the tool would be a
 * second thing to keep in step on the one call that decides whether anything
 * works at all.
 *
 * Both httpOnly in practice: no script ever needs to read them.
 */
export const ACCESS_COOKIE = 'overtone_access'
export const REFRESH_COOKIE = 'overtone_refresh'
