// US-032 · the shared password
//
// The front door is the one endpoint that must not throw. Every other
// body-reading route in the app answers a malformed body with 400; this one
// answered 500, because `request.formData()` throws on an unexpected
// content-type and nothing caught it.
import { describe, expect, it } from 'vitest'
import { POST } from './route.js'

const post = async (init: RequestInit): Promise<Response> =>
  POST(new Request('http://localhost/api/enter', { method: 'POST', ...init }))

describe('POST /api/enter', () => {
  it.each([
    ['JSON when it wanted a form', { headers: { 'content-type': 'application/json' }, body: '{"a":' }],
    ['no body at all', {}],
    ['plain text', { headers: { 'content-type': 'text/plain' }, body: 'hello' }],
  ])('refuses %s without throwing', async (_what, init) => {
    const answered = await post(init)

    expect(answered.status).toBe(400)
  })

  /*
   * A wrong password and an unreadable request must not be told apart. The
   * 400 says the request was malformed; a password that simply does not
   * match still gets the same 303 back to the form as before, so the
   * response never reports whether a guess was close.
   */
  it('sends a wrong password back to the form, not to an error', async () => {
    const answered = await post({
      body: new URLSearchParams({ password: 'wrong', locale: 'pt' }),
    })

    expect(answered.status).toBe(303)
    expect(answered.headers.get('location')).toContain('/pt/entrar?wrong=1')
  })

  /*
   * The locale arrives in a form field and is interpolated into a URL, which
   * made it a way to pick the host: `//evil.example.com/entrar` is read as
   * protocol-relative and leaves the site. Confirmed against production
   * before the fix, on both the refusal and the success path — and the
   * success one redirects *after* setting the cookie.
   */
  it.each([
    ['protocol-relative', '/evil.example.com'],
    ['a full URL', 'https://evil.example.com'],
    ['a scheme', 'javascript:alert(1)'],
    ['traversal', '../../evil.example.com'],
    ['a backslash', String.raw`\evil.example.com`],
    ['an unknown locale', 'de'],
    ['nothing', ''],
  ])('does not let %s in the locale field steer the redirect', async (_what, locale) => {
    const answered = await post({ body: new URLSearchParams({ password: 'wrong', locale }) })

    const sentTo = new URL(answered.headers.get('location') ?? '', 'http://localhost')
    expect(sentTo.host).toBe('localhost')
    expect(sentTo.pathname).toBe('/pt/entrar')
  })

  it('still honours a locale that is one of ours', async () => {
    const answered = await post({ body: new URLSearchParams({ password: 'wrong', locale: 'en' }) })

    expect(answered.headers.get('location')).toContain('/en/entrar?wrong=1')
  })
})
