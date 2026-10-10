
/** How often the reveal advances. Twenty times a second reads as motion. */
export const REVEAL_TICK_MS = 50

/**
 * The longest the reveal is allowed to lag behind what is transcribed.
 *
 * The ceiling that makes this honest. Text appearing a word at a time is
 * pleasant for a sentence and a lie for an episode: a chunk is two thousand
 * words, so a fixed typing pace would still be reading out the first chunk
 * when the fourth landed — a stale transcript presented as a live one.
 *
 * Not a parameter of the reveal, a property of it. The test holds the pacing
 * below to this, so tuning the pacing cannot quietly break the promise.
 */
export const REVEAL_CATCH_UP_MS = 20_000

/**
 * How much of the backlog goes in one tick.
 *
 * Revealing a fraction of what is pending, rather than a fixed number of
 * characters, is what keeps the pace honest without making it uniform: a
 * chunk that has just landed pours in and eases off as it empties, while the
 * last sentence of it arrives at reading speed. Tuned against the window
 * above, which is the thing actually being promised.
 */
const BACKLOG_DIVISOR = 40

/** Never slower than this, so the reveal cannot visibly stall. */
const MIN_CHARS_PER_TICK = 2

/**
 * Where the reveal has got to after one tick.
 *
 * The pace comes off the backlog, so the reveal is driven by how much is
 * waiting rather than by a clock of its own. That is the whole trick: it
 * reads as typing when a little has arrived and as a fill when a lot has,
 * and it can never be left minutes behind the transcription.
 */
export function revealAfterTick(shown: number, total: number): number {
  const pending = total - shown
  if (pending <= 0) return total

  const step = Math.max(MIN_CHARS_PER_TICK, Math.ceil(pending / BACKLOG_DIVISOR))
  return Math.min(total, shown + step)
}

/** How much there is to reveal in total. */
export function totalChars<T extends { readonly text: string }>(lines: readonly T[]): number {
  return lines.reduce((count, line) => count + line.text.length, 0)
}

/**
 * The lines to put on the page, with the one being read cut short.
 *
 * Generic over what a line is, because the reveal is about characters and
 * nothing else — the timing a line carries is the reader's business, not
 * this module's.
 *
 * A line that is fully revealed comes back as the object it was given. The
 * reveal advances twenty times a second over a transcript that reaches
 * twenty thousand words, so a fresh object for settled text would have
 * React rebuild the whole thing on every tick — only the line being typed
 * has any business changing.
 */
export function visibleLines<T extends { readonly text: string }>(
  lines: readonly T[],
  revealed: number,
): T[] {
  const visible: T[] = []
  let budget = revealed

  for (const line of lines) {
    if (budget <= 0) break

    // A chunk of silence or music. An empty paragraph is a hole in the page
    // that nothing on it explains.
    if (line.text.length === 0) continue

    visible.push(budget >= line.text.length ? line : { ...line, text: line.text.slice(0, budget) })
    budget -= line.text.length
  }

  return visible
}
