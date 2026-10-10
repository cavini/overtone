/**
 * Whether a request to a scheduled endpoint came from the scheduler.
 *
 * Vercel sends the project's `CRON_SECRET` as a bearer token on every cron
 * invocation. Checking it keeps a public URL from being a button anyone can
 * press — which matters less for a liveness ping than for an upload, but the
 * endpoint sits outside the password gate and something has to stand there.
 *
 * Open when nothing is configured, the same way the password gate is: a
 * fresh checkout runs with no setup.
 */
export function isTheScheduler(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (secret === undefined || secret.length === 0) return true

  return authorization === `Bearer ${secret}`
}
