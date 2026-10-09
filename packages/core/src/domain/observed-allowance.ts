/**
 * The transcription balance as the provider itself reported it.
 *
 * Measured rather than modelled (ADR 0021). The provider returns its current
 * balance on every response, which is ground truth, free, and tracks changes
 * to its own limits without a redeploy on our side.
 *
 * Named for what it is — an observation — because it is a reading taken at a
 * moment, not a running total we maintain. By the time anything acts on it,
 * the bucket has already refilled a little.
 */
export interface ObservedAllowance {
  /** Audio the balance can still afford, at the moment of the reading. */
  readonly remainingAudioMs: number
  /** The full bucket. */
  readonly limitAudioMs: number
  /** How long until the bucket is full again. */
  readonly refillsFullyInMs: number
}

/**
 * How fast the bucket refills: 7 200 audio-seconds per hour, so two
 * audio-milliseconds per wall-millisecond.
 *
 * Measured twice, exactly, in `docs/experiments/0003`. It is a constant here
 * because the first chunk of a run has no response to read yet — every chunk
 * after it paces on the reported balance instead.
 */
export const ALLOWANCE_REFILL_RATE = 2
