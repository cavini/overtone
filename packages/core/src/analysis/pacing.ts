import { ALLOWANCE_REFILL_RATE } from '../domain/observed-allowance.js'
import type { AllowanceState } from '../domain/allowance.js'
import type { AudioChunk } from '../domain/audio-chunk.js'

/**
 * The free tier's allowances, in milliseconds of audio.
 *
 * Taken from the service's own refusal rather than from its documentation:
 *
 *     seconds of audio per hour (ASPH): Limit 7200, Requested 7591
 *
 * Note what is being measured. Not requests, not bytes — **seconds of audio
 * sent**. That is why sending the chunks concurrently buys nothing: six
 * twenty-minute chunks at once spend the same 7 591 seconds as one file did,
 * and fail together.
 *
 * The hourly figure is a bucket size, not a quota per clock hour. It refills
 * at `ALLOWANCE_REFILL_RATE` continuously (`docs/experiments/0003`).
 */
export const HOURLY_ALLOWANCE_MS = 7_200_000
export const DAILY_ALLOWANCE_MS = 28_800_000

export type PacingDecision =
  | { readonly send: true; readonly chunk: AudioChunk }
  | { readonly send: false; readonly reason: 'COMPLETE' }
  | {
      readonly send: false
      readonly reason: 'HOURLY_ALLOWANCE_EXHAUSTED' | 'DAILY_ALLOWANCE_EXHAUSTED'
      readonly retryAfterMs: number
    }

/**
 * What the bucket holds now, given what it held at a known moment.
 *
 * Clamped at both ends: it cannot hold more than the bucket, and a reading
 * stamped in the future — two machines whose clocks disagree — must not
 * subtract refill and invent a smaller balance than was actually reported.
 */
export function balanceAt(allowance: AllowanceState, nowMs: number): number {
  const elapsed = Math.max(0, nowMs - allowance.asOfMs)
  return Math.min(HOURLY_ALLOWANCE_MS, allowance.remainingAudioMs + elapsed * ALLOWANCE_REFILL_RATE)
}

/**
 * Decides whether the next chunk may be sent, and if not, when to come back.
 *
 * This is the shape transcription takes once the binding limit is *audio
 * duration* rather than file size (ADR 0020). An episode of this show is
 * longer than a full balance, so the chunks have to be paced and the waiting
 * is a normal state of the system rather than an error.
 *
 * The wait is only as long as **this chunk** needs, not until the bucket is
 * full. On a two-hour episode that is the difference between a few minutes
 * and an hour (ADR 0021).
 *
 * Takes `nowMs` rather than reading a clock, so it stays a pure function and
 * every boundary is testable. The caller gets the time from the `Clock` port.
 */
export function nextChunkToSend(
  plan: readonly AudioChunk[],
  transcribedIndexes: readonly number[],
  allowance: AllowanceState,
  nowMs: number,
): PacingDecision {
  const done = new Set(transcribedIndexes)
  const chunk = plan.find((candidate) => !done.has(candidate.index))

  if (chunk === undefined) return { send: false, reason: 'COMPLETE' }

  const needsMs = chunk.endMs - chunk.startMs

  // A window that has already turned over is spent to zero, whatever the
  // stored tally says.
  const dailyUsed = allowance.dayResetsAt <= nowMs ? 0 : allowance.dailyUsedMs

  // The day is reported first because it is the harder wall. Telling someone
  // to come back in ten minutes when the real answer is tomorrow is worse
  // than telling them nothing.
  if (dailyUsed + needsMs > DAILY_ALLOWANCE_MS) {
    return {
      send: false,
      reason: 'DAILY_ALLOWANCE_EXHAUSTED',
      retryAfterMs: Math.max(0, allowance.dayResetsAt - nowMs),
    }
  }

  const balance = balanceAt(allowance, nowMs)
  if (balance < needsMs) {
    return {
      send: false,
      reason: 'HOURLY_ALLOWANCE_EXHAUSTED',
      // Rounded up: a wait rounded down comes back a millisecond early and is
      // refused, which costs a whole round trip to learn nothing.
      retryAfterMs: Math.ceil((needsMs - balance) / ALLOWANCE_REFILL_RATE),
    }
  }

  return { send: true, chunk }
}
