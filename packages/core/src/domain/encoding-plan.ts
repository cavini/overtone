/**
 * How an episode is prepared for upload.
 *
 * The whole point is that one file goes up, whole. Splitting a two-hour
 * episode into parts and stitching the word timings back together was the
 * earlier design, and the stitching failed *silently* — counts stayed
 * plausible while pointing at the wrong moment in the audio. Choosing the
 * encoding so a single file always fits removes that entire class of bug
 * (ADR 0018).
 */

const MS_PER_MINUTE = 60_000
const BITS_PER_BYTE = 8

/**
 * The service refuses anything over 25 MB. The budget sits just below that;
 * the honest overhead factor below does the work of keeping an estimate from
 * running past the real cap, so this no longer needs to be conservative too.
 * Two stacked safety margins only cost audio quality.
 */
export const UPLOAD_BUDGET_BYTES = 24 * 1024 * 1024

/**
 * Encoders overshoot the bitrate they are asked for.
 *
 * Measured, not guessed: a 2 h 06 m episode asked for 24 kbps and came out at
 * 24.9 kbps once the container and the encoder's own variability were counted —
 * 4% over a naive `duration × bitrate`. Six percent leaves a little room
 * beyond what was observed.
 *
 * Without this the estimate is quietly optimistic, which is the wrong
 * direction: the failure it causes happens at the end of a long upload.
 */
const CONTAINER_OVERHEAD = 1.06

/** 150 minutes, the supported episode length. */
export const MAX_EPISODE_MS = 150 * MS_PER_MINUTE

/**
 * Tried highest first. The floor is 20 kbps: Opus is remarkably good at low
 * rates for speech, but transcription accuracy on slang, names and in-jokes
 * is already the biggest risk in this product, and in-jokes are the product.
 * Trading audio quality for a longer ceiling would spend the one thing we
 * cannot spare.
 */
const BITRATE_LADDER_KBPS = [32, 28, 24, 20] as const

export interface EncodingPlan {
  readonly sampleRateHz: 16_000
  readonly channels: 1
  readonly bitrateKbps: number
  readonly estimatedBytes: number
}

export type EncodingRefusal =
  | { readonly code: 'UNREADABLE_AUDIO' }
  | {
      readonly code: 'EPISODE_TOO_LONG'
      readonly durationMinutes: number
      readonly maxMinutes: number
    }

export type EncodingOutcome =
  | { readonly ok: true; readonly plan: EncodingPlan }
  | { readonly ok: false; readonly failure: EncodingRefusal }

const estimateBytes = (durationMs: number, bitrateKbps: number): number =>
  Math.ceil(
    (durationMs / 1000) * ((bitrateKbps * 1000) / BITS_PER_BYTE) * CONTAINER_OVERHEAD,
  )

/**
 * Picks the best quality that still fits one upload.
 *
 * A refusal names the real numbers rather than saying the file is too large,
 * because "too large" sends someone hunting for a compressor they do not
 * need — the constraint is duration, and the fix is splitting the episode.
 */
export function planEncoding(durationMs: number): EncodingOutcome {
  if (durationMs <= 0) {
    return { ok: false, failure: { code: 'UNREADABLE_AUDIO' } }
  }

  if (durationMs > MAX_EPISODE_MS) {
    return {
      ok: false,
      failure: {
        code: 'EPISODE_TOO_LONG',
        durationMinutes: Math.ceil(durationMs / MS_PER_MINUTE),
        maxMinutes: MAX_EPISODE_MS / MS_PER_MINUTE,
      },
    }
  }

  for (const bitrateKbps of BITRATE_LADDER_KBPS) {
    const estimatedBytes = estimateBytes(durationMs, bitrateKbps)
    if (estimatedBytes >= UPLOAD_BUDGET_BYTES) continue

    return {
      ok: true,
      plan: { sampleRateHz: 16_000, channels: 1, bitrateKbps, estimatedBytes },
    }
  }

  /* c8 ignore next 8 -- unreachable: the ladder's floor is chosen so that the
     longest supported episode fits, and a test walks every minute from 1 to
     150 to prove it. Kept because the relationship is an invariant between two
     constants, and a future edit to either should fail loudly rather than
     return a plan that cannot be uploaded. */
  return {
    ok: false,
    failure: {
      code: 'EPISODE_TOO_LONG',
      durationMinutes: Math.ceil(durationMs / MS_PER_MINUTE),
      maxMinutes: MAX_EPISODE_MS / MS_PER_MINUTE,
    },
  }
}
