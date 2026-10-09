/**
 * What the transcription allowance can afford.
 *
 * A domain concept rather than an analysis one. The free tier counts
 * **seconds of audio sent** against one shared account — not requests, not
 * bytes — and that single fact decides the shape of the whole pipeline: an
 * episode of this show is longer than a full hourly balance, so it cannot be
 * sent as one request and the chunks have to be paced (ADR 0020).
 *
 * The hourly allowance is a bucket that refills continuously, measured in
 * `docs/experiments/0003`, so a balance is only true at an instant — hence
 * `asOfMs`. Whoever reads this adds the refill since.
 *
 * The daily cap is different: the provider does not report it, so it stays a
 * tally against a window that turns over. It is the one limit here still
 * modelled rather than measured (ADR 0021).
 */
export interface AllowanceState {
  /** Audio the balance could afford at `asOfMs`. */
  readonly remainingAudioMs: number
  /** When that was true. */
  readonly asOfMs: number
  readonly dailyUsedMs: number
  readonly dayResetsAt: number
}
