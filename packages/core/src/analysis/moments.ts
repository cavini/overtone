/**
 * Turning scattered matches into the handful of moments a person meant.
 *
 * Searching a transcript returns segments, and a segment is about three
 * seconds long. A stretch where the group actually talked about something
 * therefore produces a cluster of near-identical timestamps, and listing
 * them one by one buries the answer — "they discussed it here, at length" —
 * under a column of numbers two seconds apart.
 */

/** When one hit stops belonging to the previous one. */
export const MOMENT_GAP_MS = 90_000

export interface Hit {
  readonly startMs: number
  readonly endMs: number
}

export interface Moment {
  readonly startMs: number
  readonly endMs: number
  /** How many matches fell inside it — how much of it was about this. */
  readonly hitCount: number
}

/**
 * Gathers hits into the conversations they came from.
 *
 * Ordered by how much of each moment was about the thing, because the one
 * someone is looking for is the stretch they talked about it — not the first
 * time the word slipped out in passing. Ties go to whichever came first, so
 * the order never depends on how the rows happened to arrive.
 */
export function groupIntoMoments(hits: readonly Hit[], gapMs = MOMENT_GAP_MS): Moment[] {
  if (hits.length === 0) return []

  const inOrder = [...hits].sort((a, b) => a.startMs - b.startMs)
  const moments: Array<{ startMs: number; endMs: number; hitCount: number }> = []

  for (const hit of inOrder) {
    const current = moments.at(-1)

    if (current !== undefined && hit.startMs - current.endMs <= gapMs) {
      // Never backwards: two hits can overlap when one word falls across
      // adjacent segments.
      current.endMs = Math.max(current.endMs, hit.endMs)
      current.hitCount += 1
      continue
    }

    moments.push({ startMs: hit.startMs, endMs: Math.max(hit.startMs, hit.endMs), hitCount: 1 })
  }

  return moments.sort((a, b) => b.hitCount - a.hitCount || a.startMs - b.startMs)
}
