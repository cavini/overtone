/**
 * What of the transcription allowance has been spent, and when each window
 * turns over.
 *
 * A domain concept rather than an analysis one. The free tier counts
 * **seconds of audio sent** against one shared account — not requests, not
 * bytes — and that single fact decides the shape of the whole pipeline: an
 * episode of this show is longer than the hourly allowance, so it cannot be
 * transcribed in one hour and the work has to be paced across them
 * (ADR 0020).
 */
export interface AllowanceState {
  readonly hourlyUsedMs: number
  readonly dailyUsedMs: number
  readonly hourResetsAt: number
  readonly dayResetsAt: number
}
