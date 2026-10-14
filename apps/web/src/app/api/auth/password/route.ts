import { registerAccount, signInWithPassword } from '../../../../server/accounts.js'
import { keepSignedIn } from '../../../../server/session.js'
import { identityProvider } from '../../../../server/wiring.js'

export const runtime = 'nodejs'

/**
 * Signing in with a password, and making the account that has one.
 *
 * One route for both, because they take the same two fields and differ only
 * in which way the answer goes — and because every refusal they can give is
 * the same refusal, which is easier to keep true in one place than two.
 *
 * Thin on purpose. Every rule — who may register, what a password has to
 * be, and which refusals are flattened into one — lives in
 * `server/accounts.ts`, where it is unit tested. A route is the one place in
 * this codebase that nothing tests directly, so it is the one place no
 * decision should live.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    email?: unknown
    password?: unknown
    making?: unknown
  }

  const email = typeof body.email === 'string' ? body.email : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const making = body.making === true

  if (email.length === 0 || password.length === 0) {
    return Response.json({ error: 'WRONG_EMAIL_OR_PASSWORD' }, { status: 400 })
  }

  const provider = identityProvider()
  const allowList = process.env['OVERTONE_INVITED']

  const outcome = making
    ? await registerAccount(provider, email, password, allowList)
    : await signInWithPassword(provider, email, password, allowList)

  if (!outcome.ok) {
    /*
     * 401 for a refusal about this person, 503 for one about the service.
     * A 503 is what tells the form to say "try again shortly" rather than
     * leaving somebody retyping a password that was right.
     */
    const status = outcome.code === 'PROVIDER_UNAVAILABLE' ? 503 : 401

    return Response.json({ error: outcome.code }, { status })
  }

  /*
   * The session goes in httpOnly cookies and never to the browser's
   * JavaScript. The response says nothing but that it worked — an access
   * token in a JSON body is a token any script on the page can read.
   */
  await keepSignedIn(outcome.session)

  return Response.json({ ok: true })
}
