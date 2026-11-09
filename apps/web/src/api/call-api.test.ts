// ADR 0017
//
// One way to call our own endpoints. Seven components had their own, and
// only one of them handled the failure that actually happens in production:
// a platform error answers HTML, and `response.json()` throws on it.
import { describe, expect, it, vi } from 'vitest'
import { callApi } from './call-api.js'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const stub = (response: Response | Error) =>
  vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)))

const call = <T,>(path: string, response: Response | Error, options = {}) => {
  const fetchImpl = stub(response)
  return {
    fetchImpl,
    result: callApi<T>(path, { ...options, fetch: fetchImpl as unknown as typeof globalThis.fetch }),
  }
}

describe('calling our own api', () => {
  it('hands back the parsed body when it worked', async () => {
    const { result } = call<{ topics: string[] }>('/api/topics', json({ topics: ['a'] }))

    expect(await result).toEqual({ ok: true, data: { topics: ['a'] } })
  })

  /*
   * The failure every component but one got wrong. A body too large, a
   * function that timed out, a platform error page: all of them answer HTML
   * or plain text, and `.json()` throws a SyntaxError on it. Unhandled that
   * surfaced as "the file may be corrupt", which sent people looking at
   * their audio instead of at the request.
   */
  it('turns a non-JSON answer into a readable error instead of throwing', async () => {
    const html = new Response('<html>Request Entity Too Large</html>', { status: 413 })
    const { result } = call('/api/episodes/start', html)
    const answered = await result

    expect(answered.ok).toBe(false)
    if (answered.ok) throw new Error('expected a failure')
    expect(answered.error).toContain('413')
  })

  // Our own refusals travel as a code in the body (ADR 0017). The caller
  // gets the code, not the status, because the code is what has a sentence
  // in the catalogue.
  it('reports our own refusal code rather than the status', async () => {
    const { result } = call('/api/topics', json({ error: 'TOPIC_NAME_TAKEN' }, 409))
    const answered = await result

    if (answered.ok) throw new Error('expected a failure')
    expect(answered.error).toBe('TOPIC_NAME_TAKEN')
  })

  // A 200 that carries an error field is still a failure. Some routes answer
  // this way and a caller checking only the status would read the error as data.
  it('treats an error field in a 200 as a failure', async () => {
    const { result } = call('/api/episodes/start', json({ error: 'EPISODE_TOO_LONG' }))
    const answered = await result

    if (answered.ok) throw new Error('expected a failure')
    expect(answered.error).toBe('EPISODE_TOO_LONG')
  })

  /*
   * A dropped connection used to be `.catch(() => undefined)` in six
   * different components, which made "offline" indistinguishable from
   * "answered with nothing".
   */
  it('reports a dropped connection rather than throwing', async () => {
    const { result } = call('/api/series', new TypeError('Failed to fetch'))
    const answered = await result

    if (answered.ok) throw new Error('expected a failure')
    expect(answered.error).toBe('OFFLINE')
  })

  it('sends a body as JSON with the header that goes with it', async () => {
    const { fetchImpl, result } = call('/api/topics', json({}), {
      method: 'POST',
      body: { name: 'feijão' },
    })
    await result

    const [path, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe('/api/topics')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('content-type')).toBe('application/json')
    expect(JSON.parse(String(init.body))).toEqual({ name: 'feijão' })
  })

  // A GET with no body must not announce a content type it is not sending.
  it('sends no body and no content type when there is nothing to send', async () => {
    const { fetchImpl, result } = call('/api/series', json({}))
    await result

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.body).toBeUndefined()
    expect(new Headers(init.headers).get('content-type')).toBeNull()
  })

  // Some endpoints answer 204 or an empty body. That is a success with
  // nothing in it, not a parse failure.
  it('accepts an empty body as success', async () => {
    // 204 forbids a body, so the constructor wants null rather than ''.
    const { result } = call('/api/episodes/list', new Response(null, { status: 204 }))
    expect(await result).toEqual({ ok: true, data: {} })

    const blank = call('/api/episodes/list', new Response('', { status: 200 }))
    expect(await blank.result).toEqual({ ok: true, data: {} })
  })
})
