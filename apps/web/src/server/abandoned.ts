/**
 * How long an upload has to finish arriving before it is given up on.
 *
 * Generous, because the thing being waited for is a browser pushing a
 * two-hour episode up a domestic connection — twenty-odd megabytes a chunk,
 * ten chunks, on whatever upstream the uploader has. Half an hour is longer
 * than that takes and short enough that a genuinely abandoned upload does
 * not sit in the way for a day.
 */
export const UPLOAD_GRACE_MS = 30 * 60_000

/**
 * Whether an upload that is missing its audio has been given up on.
 *
 * The distinction matters because the scheduler takes the **oldest**
 * unfinished episode every minute (ADR 0027). An episode whose audio never
 * arrived is unfinishable, and without this it stays at the head of the
 * queue forever — picked every minute, failing every minute, and starving
 * every episode behind it.
 *
 * But failing one the moment its audio is missing would be worse: the
 * episode's row is written *before* its chunks are uploaded, so a run that
 * fires in that gap would kill a perfectly good upload. Hence the wait.
 */
export function isAbandoned(createdAtMs: number, nowMs: number): boolean {
  return nowMs - createdAtMs > UPLOAD_GRACE_MS
}
