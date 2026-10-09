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
 */
export const HOURLY_ALLOWANCE_MS = 7_200_000
export const DAILY_ALLOWANCE_MS = 28_800_000

/** What has been spent, and when each window turns over. */
export interface AllowanceState {
  readonly hourlyUsedMs: number
  readonly dailyUsedMs: number
  readonly hourResetsAt: number
  readonly dayResetsAt: number
}

export type PacingDecision =
  | { readonly send: true; readonly chunk: AudioChunk }
  | { readonly send: false; readonly reason: 'COMPLETE' }
  | {
      readonly send: false
      readonly reason: 'HOURLY_ALLOWANCE_EXHAUSTED' | 'DAILY_ALLOWANCE_EXHAUSTED'
      readonly retryAfterMs: number
    }

const waitUntil = (resetsAt: number, nowMs: number): number =>
  Math.max(0, resetsAt - nowMs)

/**
 * Decides whether the next chunk may be sent, and if not, when to come back.
 *
 * This is the shape transcription takes once the binding limit is *audio
 * duration per hour* rather than file size (ADR 0020). An episode of this
 * show is longer than the whole hourly allowance, so it cannot be finished
 * inside one hour at all — the chunks have to be paced, and the waiting is a
 * normal state of the system rather than an error.
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
  // stored counter says.
  const hourlyUsed = allowance.hourResetsAt <= nowMs ? 0 : allowance.hourlyUsedMs
  const dailyUsed = allowance.dayResetsAt <= nowMs ? 0 : allowance.dailyUsedMs

  // The day is reported first because it is the harder wall. Telling someone
  // to come back in ten minutes when the real answer is tomorrow is worse
  // than telling them nothing.
  if (dailyUsed + needsMs > DAILY_ALLOWANCE_MS) {
    return {
      send: false,
      reason: 'DAILY_ALLOWANCE_EXHAUSTED',
      retryAfterMs: waitUntil(allowance.dayResetsAt, nowMs),
    }
  }

  if (hourlyUsed + needsMs > HOURLY_ALLOWANCE_MS) {
    return {
      send: false,
      reason: 'HOURLY_ALLOWANCE_EXHAUSTED',
      retryAfterMs: waitUntil(allowance.hourResetsAt, nowMs),
    }
  }

  return { send: true, chunk }
}
