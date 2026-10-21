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

/**
 * How long an episode may make no progress at all before it is written off.
 *
 * Two days, which is deliberately far longer than any gap the pipeline can
 * legitimately produce. The longest of those is a daily-allowance wait: the
 * day's eight audio-hours are spent, and the episode sits until the window
 * turns over. That is twenty-four hours of nothing happening with nothing
 * wrong, so anything at or below it would write off healthy episodes — the
 * same mistake as giving up on one bad response, made one layer out.
 */
export const STALL_GRACE_MS = 48 * 60 * 60_000

/**
 * Whether an episode has stopped making progress for good.
 *
 * The bound on retrying. A refusal that might be transient leaves the
 * episode in `transcribing` so the next scheduled run tries the same chunk
 * again, which is what stops a single bad response costing a two-hour
 * episode. The cost of that is paid here: the scheduler takes the *oldest*
 * in-flight episode (ADR 0027), so a chunk that fails every single time
 * holds the head of the queue and nothing behind it moves.
 *
 * Measured from the last chunk that landed — or from the upload, for an
 * episode that never got one — so it needs nothing stored that is not
 * already there. `chunk_transcripts.created_at` is the record of progress.
 *
 * Only consulted when a step has actually failed. An episode waiting for
 * the allowance to refill is not failing and never reaches this, which is
 * what lets the grace be measured in progress rather than in attempts.
 */
export function isStalled(lastProgressMs: number, nowMs: number): boolean {
  return nowMs - lastProgressMs > STALL_GRACE_MS
}
