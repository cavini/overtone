import { timingSafeEqual } from 'node:crypto'

/**
 * Whether a request to a scheduled endpoint came from the scheduler.
 *
 * Vercel sends the project's `CRON_SECRET` as a bearer token on every cron
 * invocation. Checking it keeps a public URL from being a button anyone can
 * press — and two endpoints sit behind this one function, which is what the
 * earlier version of it got wrong.
 *
 * `keep-alive` reads one row and returns nothing. `advance-pending` reaches
 * for the oldest unfinished episode belonging to **any** user and spends a
 * transcription allowance shared by everyone with an account. This used to be
 * reasoned about as though only the first existed: it opened when no secret
 * was configured, on the password gate's bargain that a fresh checkout runs
 * with no setup, and it compared with `===`.
 *
 * Both are now decided for the second endpoint instead, because that is the
 * one with something to lose:
 *
 * - **Closed when nothing is configured.** A missing variable fails loudly
 *   rather than silently opening the door. A fresh checkout gives up nothing
 *   — it has no episode to advance and nobody pinging it.
 * - **Compared in constant time.** A byte-by-byte comparison leaks where the
 *   first difference is, and this is a generated secret rather than a
 *   password somebody chose.
 */
export function isTheScheduler(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (secret === undefined || secret.length === 0) return false

  const expected = Buffer.from(`Bearer ${secret}`)
  const given = Buffer.from(authorization ?? '')

  /*
   * The length check is first because `timingSafeEqual` throws on buffers of
   * different lengths rather than returning false. It leaks the secret's
   * length, which is not worth protecting — what matters is that a caller
   * cannot learn the secret one byte at a time from how long we took.
   */
  return expected.length === given.length && timingSafeEqual(expected, given)
}
