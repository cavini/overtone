/**
 * One way to call our own endpoints.
 *
 * Seven components had their own version of this, and between them they
 * covered four different shapes of the same four lines: build the request,
 * set the header, read the body, decide whether it worked. Only one of the
 * seven handled the failure that actually happens.
 *
 * **The failure the other six got wrong.** A platform error — a body over
 * the serverless limit, a function that timed out, an error page from the
 * host — answers HTML or plain text. `response.json()` throws a SyntaxError
 * on that, and unhandled it surfaced as "the file may be corrupt", which
 * sent people looking at their audio instead of at the request.
 *
 * It also replaces `.catch(() => undefined)`, which appeared in six of them
 * and made "the connection dropped" indistinguishable from "answered with
 * nothing".
 *
 * `fetch` is injectable for the same reason it is on
 * `GroqTranscriptionProvider`: the seam a test needs is the one the test
 * needs, and nothing here should require a browser.
 */

export type ApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string }

export interface CallOptions {
  readonly method?: 'GET' | 'POST' | 'DELETE'
  /** Serialised as JSON. Omit it and no content type is announced. */
  readonly body?: unknown
  readonly fetch?: typeof globalThis.fetch
}

/** Nothing arrived at all, as a code rather than a sentence (ADR 0017). */
const OFFLINE = 'OFFLINE'

export async function callApi<T>(path: string, options: CallOptions = {}): Promise<ApiResult<T>> {
  const send = options.fetch ?? globalThis.fetch.bind(globalThis)

  let response: Response
  try {
    response = await send(path, {
      method: options.method ?? 'GET',
      ...(options.body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(options.body) }),
    })
  } catch {
    return { ok: false, error: OFFLINE }
  }

  const text = await response.text().catch(() => '')

  /*
   * An empty body is a success with nothing in it. A 204, or a route that
   * answers nothing at all, is not a parse failure.
   */
  if (text.length === 0) {
    return response.ok ? { ok: true, data: {} as T } : { ok: false, error: `${response.status}` }
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(text) as Record<string, unknown>
  } catch {
    // Not JSON, so not ours. The status and the first line of whatever it
    // did say are the only useful things in it.
    return { ok: false, error: `${response.status} ${text.slice(0, 120)}` }
  }

  /*
   * Our own refusals travel as a code in the body (ADR 0017), and some
   * routes answer one with a 200. Checking the status alone would read the
   * refusal as data.
   */
  const refusal = payload['error']
  if (!response.ok || refusal !== undefined) {
    return { ok: false, error: String(refusal ?? response.status) }
  }

  return { ok: true, data: payload as T }
}
