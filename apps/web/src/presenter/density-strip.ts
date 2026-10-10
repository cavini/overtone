/**
 * How many slices the episode is cut into.
 *
 * Enough that a cluster reads as a cluster, few enough that each slice is a
 * touchable target on a phone — forty across a narrow screen is about six
 * pixels each, which is a mark rather than a button, so the strip as a
 * whole carries the label and not the individual slices.
 */
export const BANDS = 40

/** One slice of the episode, and how busy it was. */
export interface Band {
  /** Where the slice starts, so a label can say when. */
  readonly startMs: number
  readonly count: number
  /** 0–100, against the busiest slice of this topic. */
  readonly heat: number
}

/**
 * Where in an episode a running joke clustered.
 *
 * The count answers "how often" and the quotes answer "doing what"; neither
 * answers *when*, which is the one a group actually argues about — whether
 * a bit ran all episode or was three minutes near the end.
 *
 * Scaled against the topic's own busiest slice, like the series sparkline
 * and for the same reason: the question each strip answers is about itself,
 * and one shared scale would flatten every quiet topic into a flat line.
 *
 * An episode with no duration gets nothing rather than a divide by zero —
 * that happens for an episode still being processed, where the strip would
 * be a lie anyway.
 */
export function densityStrip(
  mentions: readonly { readonly startMs: number }[],
  durationMs: number,
  bands: number = BANDS,
): Band[] {
  if (durationMs <= 0 || bands <= 0) return []

  const width = durationMs / bands
  const counts = new Array<number>(bands).fill(0)

  for (const mention of mentions) {
    // Clamped, because a mention sitting exactly on the end would index one
    // past the last slice — and a stray timestamp past the end is a bug
    // somewhere else, not a reason to throw here.
    const at = Math.min(bands - 1, Math.max(0, Math.floor(mention.startMs / width)))
    counts[at] = (counts[at] ?? 0) + 1
  }

  const busiest = Math.max(0, ...counts)

  return counts.map((count, index) => ({
    startMs: Math.round(index * width),
    count,
    heat: busiest === 0 ? 0 : (100 * count) / busiest,
  }))
}
