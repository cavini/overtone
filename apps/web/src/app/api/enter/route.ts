import { LOCALES } from '@overtone/messages'
import { cookies } from 'next/headers'
import { GATE_COOKIE, tokenFor } from '../../../server/gate.js'

export const runtime = 'nodejs'

/** A month. Long enough that the group is not retyping it every week. */
const MONTH_SECONDS = 30 * 24 * 60 * 60

/**
 * Which locale to send them back to.
 *
 * This value arrives from a form field and is then interpolated into a URL,
 * which made it a way to choose the host. `locale` of `/evil.example.com`
 * builds the path `//evil.example.com/entrar`, and `new URL` reads a
 * leading double slash as protocol-relative — so the redirect left the
 * site. On the success path that happened *after* the session cookie was
 * set, which is the shape of a credential-phishing hop: post to the real
 * app, land on a copy of it already signed in.
 *
 * Anything not one of ours becomes the default rather than an error. The
 * field is not something a person types, so a bad one is either a bug or an
 * attack, and neither deserves a distinct answer.
 */
const localeFrom = (given: unknown): string =>
  LOCALES.includes(given as (typeof LOCALES)[number]) ? String(given) : 'pt'

/**
 * Takes the shared password and hands back a cookie.
 *
 * A wrong password and an unconfigured one answer identically, so the
 * response says nothing about which passwords are close or whether the gate
 * is even switched on.
 */
export async function POST(request: Request): Promise<Response> {
  /*
   * `formData()` throws on a content-type it cannot read, and this is the
   * front door: every other body-reading route in the app answers a
   * malformed request with 400, while this one was the only 500 in the set.
   */
  const form = await request.formData().catch(() => undefined)
  if (form === undefined) {
    return Response.json({ error: 'UNREADABLE_REQUEST' }, { status: 400 })
  }

  const given = String(form.get('password') ?? '')
  const locale = localeFrom(form.get('locale'))
  const expected = process.env['OVERTONE_PASSWORD'] ?? ''

  if (expected.length === 0 || given !== expected) {
    return Response.redirect(new URL(`/${locale}/entrar?wrong=1`, request.url), 303)
  }

  const jar = await cookies()
  jar.set(GATE_COOKIE, await tokenFor(expected), {
    httpOnly: true,
    sameSite: 'lax',
    // Vercel serves over HTTPS; a local checkout does not.
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    maxAge: MONTH_SECONDS,
  })

  return Response.redirect(new URL(`/${locale}`, request.url), 303)
}
