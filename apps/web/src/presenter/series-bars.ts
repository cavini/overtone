/** One episode's column in a topic's sparkline. */
export interface TopicBar {
  readonly episodeNumber: number
  readonly count: number
  /** 0–100, for a CSS height. */
  readonly height: number
}

/** A bar that is present but empty still has to be visible. */
const FLOOR = 2

/**
 * A topic's per-episode counts, as columns to draw.
 *
 * Scaled against the topic's own busiest episode rather than against every
 * topic at once. The question each row answers is "when did *this* joke come
 * up", and sharing one scale would flatten every row but the loudest into a
 * line along the bottom.
 *
 * An episode where it never came up keeps a stub rather than disappearing.
 * A missing column reads as missing data; a visible empty one is the finding.
 */
export function topicBars(
  perEpisode: readonly { readonly episodeNumber: number; readonly count: number }[],
): TopicBar[] {
  const busiest = Math.max(0, ...perEpisode.map((entry) => entry.count))

  return perEpisode.map((entry) => ({
    episodeNumber: entry.episodeNumber,
    count: entry.count,
    // Never divides by zero: a topic counted nowhere is all floor.
    height: busiest === 0 ? FLOOR : FLOOR + ((100 - FLOOR) * entry.count) / busiest,
  }))
}
