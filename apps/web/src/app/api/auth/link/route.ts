import { isInvited } from '../../../../server/invited.js'
import { identityProvider } from '../../../../server/wiring.js'

/**
 * Emails a one-time sign-in link.
 *
 * Answers the same way whether or not the address is known. Saying "no such
 * account" would turn this into a way of listing the group's members for
 * anybody who can reach the page.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { email?: unknown; locale?: unknown }
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const locale = body.locale === 'en' ? 'en' : 'pt'

  if (email.length === 0) {
    return Response.json({ error: 'EMAIL_REJECTED' }, { status: 400 })
  }

  /*
   * Not on the list, and the answer is the same as if it were.
   *
   * Telling somebody they are not invited tells them the list exists and
   * that they guessed a real deployment. Nothing is sent and nothing is
   * said.
   */
  if (!isInvited(email, process.env['OVERTONE_INVITED'])) {
    return Response.json({ ok: true })
  }

  // Where the link lands. Absolute, because it is followed from an inbox.
  const returnTo = new URL(`/auth/callback?locale=${locale}`, request.url).toString()

  const sent = await identityProvider().sendLink(email, returnTo)
  if (!sent.ok) {
    const status = sent.failure.code === 'TOO_MANY_LINKS' ? 429 : 400
    return Response.json({ error: sent.failure.code }, { status })
  }

  return Response.json({ ok: true })
}
