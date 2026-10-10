/**
 * Which line of the transcript was being said at a given moment.
 *
 * The last line to have started by then — lines are contiguous, so the one
 * that started most recently is the one still running. A moment before the
 * first line begins still belongs to it: transcribers put the first word a
 * few hundred milliseconds in, and answering "none" for a hit at the very
 * top would drop the reader in at the top with nothing marked.
 *
 * Linear rather than a binary search. A two-hour episode is a few hundred
 * lines and this runs when someone clicks a result, not on every tick.
 */
export function lineAtMoment(
  lines: readonly { readonly startMs: number }[],
  ms: number,
): number | undefined {
  if (lines.length === 0) return undefined

  let found = 0
  for (const [index, line] of lines.entries()) {
    if (line.startMs > ms) break
    found = index
  }

  return found
}
