import createMiddleware from 'next-intl/middleware'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { routing } from './i18n/routing.js'
import { ACCESS_COOKIE, REFRESH_COOKIE } from './server/session.js'

const withLocale = createMiddleware(routing)

/** Where somebody asks for a sign-in link. */
const GATE_PAGE = '/entrar'

/**
 * The licence notice, open to everyone.
 *
 * ODbL asks for the dictionary's attribution to be reachable by anyone the
 * work reaches (ADR 0019), and a notice you need an account to read is not
 * reachable. It holds nothing of anybody's anyway.
 */
const CREDITS_PAGE = '/creditos'

/**
 * Paths that have to answer without a session, each for its own reason.
 *
 * `/auth/*` is how somebody gets one and `/api/auth/*` is the form behind
 * it. The two scheduled endpoints are called by Postgres and by Vercel,
 * which have no cookie and never will, and guard themselves with
 * `CRON_SECRET` (ADR 0027).
 */
const OPEN_PREFIXES = ['/auth/', '/api/auth/'] as const
const OPEN_PATHS = ['/api/keep-alive', '/api/episodes/advance-pending'] as const

/**
 * Two jobs, in order: send strangers to the door, then put the page in a
 * language.
 *
 * **This is a redirect, not the lock.** It only looks for the *presence* of
 * a session cookie, because verifying one costs a signature check and this
 * runs on very nearly every request. The enforcement is `requireUser()` in
 * each route, and the fact that a library is reached through its owner's id
 * rather than through a parameter: a forged cookie gets past this and then
 * has nothing it can read.
 */
export default function middleware(request: NextRequest): Response {
  const { pathname } = request.nextUrl
  const isApi = pathname.startsWith('/api/')

  /*
   * Paths that have no locale, and must not be given one.
   *
   * The i18n middleware prefixes anything it is handed, so `/api/auth/link`
   * becomes `/pt/api/auth/link` — a 404 wearing a redirect. The same is
   * true of the two paths that live outside the locale tree on purpose: a
   * magic link's callback, whose address is in an email and in the
   * provider's allow-list, and a shared result, whose address is in
   * somebody's chat. Both were being redirected into nowhere, which is the
   * entire feature in each case.
   */
  const unlocalised = isApi || pathname.startsWith('/auth/')

  const onward = (): Response => (unlocalised ? NextResponse.next() : withLocale(request))

  if (OPEN_PATHS.includes(pathname as (typeof OPEN_PATHS)[number])) return onward()
  if (OPEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return onward()
  if (pathname.endsWith(GATE_PAGE) || pathname.endsWith(CREDITS_PAGE)) return onward()

  const carriesSomething =
    request.cookies.has(ACCESS_COOKIE) || request.cookies.has(REFRESH_COOKIE)

  if (carriesSomething) return onward()

  // A status for a program, a page for a person. A fetch that followed a
  // redirect would get HTML where it expected JSON and report nonsense.
  if (isApi) {
    return Response.json({ error: 'NOT_SIGNED_IN' }, { status: 401 })
  }

  const [, maybeLocale] = pathname.split('/')
  const locale = routing.locales.includes(maybeLocale as never)
    ? maybeLocale
    : routing.defaultLocale

  return NextResponse.redirect(new URL(`/${locale}${GATE_PAGE}`, request.url))
}

export const config = {
  // Everything except Next's own assets and files with an extension. The
  // upload API is deliberately *not* excluded: it is the thing being
  // protected.
  matcher: ['/((?!_next|_vercel|.*\\..*).*)'],
}
