/**
 * Reads a response that is supposed to be JSON.
 *
 * A platform error — a body too large, a function that timed out — comes
 * back as HTML or plain text, and `response.json()` throws on it. Left
 * unhandled that surfaced as "the file may be corrupt", which sent everyone
 * looking at the audio instead of at the request.
 *
 * Shared rather than copied: the upload form and the pacing loop both talk
 * to endpoints that can fail this way, and a second copy is a second place
 * for the message to stop being useful.
 */
export async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`${response.status} ${text.slice(0, 120)}`)
  }
}

/** Never sleep longer than this in one go, so the page keeps saying something. */
export const MAX_SLEEP_MS = 30_000

export const sleep = (ms: number): Promise<void> =>
  new Promise((resume) => {
    setTimeout(resume, Math.min(ms, MAX_SLEEP_MS))
  })
