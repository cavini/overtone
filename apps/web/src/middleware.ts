import createMiddleware from 'next-intl/middleware'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { routing } from './i18n/routing.js'
import { GATE_COOKIE, matches, tokenFor } from './server/gate.js'

const withLocale = createMiddleware(routing)

/** Where the password is handed in. */
const GATE_PAGE = '/entrar'
const GATE_API = '/api/enter'

/**
 * The licence notice, open to everyone.
 *
 * ODbL asks for the dictionary's attribution to be reachable by anyone the
 * work reaches (ADR 0019), and a notice you need a password to read is not
 * reachable. It holds nothing of anybody's anyway.
 */
const CREDITS_PAGE = '/creditos'

async function carriesTheCookie(request: NextRequest, password: string): Promise<boolean> {
  return matches(request.cookies.get(GATE_COOKIE)?.value, await tokenFor(password))
}

/**
 * Two jobs, in order: keep strangers out, then put the page in a language.
 *
 * The gate comes first because the thing being protected is the transcription
 * allowance — one free-tier budget of three episodes a day, shared by
 * everyone (ADR 0020). An open upload endpoint on a public URL is a stranger
 * emptying it.
 */
export default async function middleware(request: NextRequest): Promise<Response> {
  const { pathname } = request.nextUrl
  const password = process.env['OVERTONE_PASSWORD']
  const isApi = pathname.startsWith('/api/')

  // An API route never gets a locale prefix. Letting the i18n middleware see
  // one rewrites `/api/enter` to `/pt/api/enter`, which is a 404 wearing a
  // redirect.
  const onward = (): Response => (isApi ? NextResponse.next() : withLocale(request))

  // No password configured means no gate. Deliberate, so a fresh checkout
  // runs with no setup — production is where it is set.
  if (password === undefined || password.length === 0) return onward()

  if (pathname === GATE_API || pathname.endsWith(GATE_PAGE)) return onward()
  if (pathname.endsWith(CREDITS_PAGE)) return onward()

  if (await carriesTheCookie(request, password)) return onward()

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
