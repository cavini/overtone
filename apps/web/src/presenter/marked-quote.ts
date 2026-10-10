import { MATCH_CLOSE, MATCH_OPEN } from '@overtone/core'

/** One run of text, and whether the search matched it. */
export interface QuotePart {
  readonly text: string
  readonly matched: boolean
}

/**
 * Turns the database's marked-up quote into something a page can render.
 *
 * The marks are control characters rather than markup, so this splits on
 * them and the page emits its own elements. Nothing builds HTML in SQL and
 * nothing has to sanitise it here.
 *
 * `limit` counts *visible* characters. The markers are characters too, so
 * truncating the raw string would cut a different amount of real text
 * depending on how many matches it held — and could slice a marker in half,
 * putting a control character on screen.
 */
export function markedQuote(quote: string, limit = Number.POSITIVE_INFINITY): QuotePart[] {
  const parts: QuotePart[] = []
  let shown = 0

  for (const [index, chunk] of quote.split(MATCH_OPEN).entries()) {
    // Everything after the first chunk begins with a matched run.
    const [matchedRun, ...rest] = index === 0 ? ['', chunk] : chunk.split(MATCH_CLOSE)

    for (const [text, matched] of [
      [matchedRun ?? '', true],
      [rest.join(MATCH_CLOSE), false],
    ] as const) {
      if (text.length === 0 || shown >= limit) continue

      const room = limit - shown
      parts.push({ text: text.length > room ? text.slice(0, room) : text, matched })
      shown += Math.min(text.length, room)
    }
  }

  return parts
}
