import { cookies } from 'next/headers'
import { GATE_COOKIE, tokenFor } from '../../../server/gate.js'

export const runtime = 'nodejs'

/** A month. Long enough that the group is not retyping it every week. */
const MONTH_SECONDS = 30 * 24 * 60 * 60

/**
 * Takes the shared password and hands back a cookie.
 *
 * A wrong password and an unconfigured one answer identically, so the
 * response says nothing about which passwords are close or whether the gate
 * is even switched on.
 */
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData()
  const given = String(form.get('password') ?? '')
  const locale = String(form.get('locale') ?? 'pt')
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
