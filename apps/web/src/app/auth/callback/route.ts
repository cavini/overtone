import { identityProvider } from '../../../server/wiring.js'
import { keepSignedIn } from '../../../server/session.js'

/**
 * Where a clicked sign-in link lands.
 *
 * Outside the locale routing on purpose: the address goes into an email and
 * into the provider's redirect allow-list, and a path that moves with the
 * reader's language is a path that has to be allow-listed twice and gets
 * out of step once.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  const locale = params.get('locale') === 'en' ? 'en' : 'pt'
  // The provider sends `token_hash`; older links carry `token`.
  const token = params.get('token_hash') ?? params.get('token') ?? ''

  const home = new URL(`/${locale}`, request.url)

  if (token.length === 0) {
    return Response.redirect(new URL(`/${locale}/entrar`, request.url), 303)
  }

  const outcome = await identityProvider().redeem(token)
  if (!outcome.ok) {
    // Back to the form rather than an error page: the only thing to do
    // about a spent or expired link is ask for another one.
    return Response.redirect(new URL(`/${locale}/entrar`, request.url), 303)
  }

  await keepSignedIn(outcome.session)

  return Response.redirect(home, 303)
}
