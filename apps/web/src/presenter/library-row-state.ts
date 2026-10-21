import { IN_FLIGHT_STATUSES } from '@overtone/core'

/** What a library row has to show next to the title. */
export type LibraryRowState = 'progress' | 'failed' | 'nothing'

/**
 * Which of three things a library row says about an episode.
 *
 * Decided by the status and nothing else. The row used to decide it by
 * comparing `chunksDone` with `chunkCount`, which answers a different
 * question — how far along a job is, not whether it is still running — and
 * so gave the same answer for an episode mid-transcription and one that had
 * given up. The failure is the case that matters, because it is the one
 * where a spinner is a claim nobody is coming back to withdraw: nothing
 * retries a `failed` episode, so the row spins until somebody reads the
 * database.
 *
 * The counts stay in the row. They were never the state — they are how far
 * along it got, which on a two-hour episode is the difference between
 * "working" and "nearly there", and that is worth as much beside a failure
 * as beside a spinner.
 */
export function libraryRowState(status: string): LibraryRowState {
  if (status === 'failed') return 'failed'

  /*
   * Cast rather than narrowed, because the status came over the wire as
   * JSON: whatever it is typed as, what arrived is a string. An unrecognised
   * one falls through to `nothing`, the answer that promises least.
   */
  return (IN_FLIGHT_STATUSES as ReadonlySet<string>).has(status) ? 'progress' : 'nothing'
}
