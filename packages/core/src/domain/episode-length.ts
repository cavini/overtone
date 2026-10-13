/**
 * Float32 samples at 16 kHz, per millisecond, per channel.
 *
 * Not the same number as `BYTES_PER_MS` in chunking: that one is the 16-bit
 * WAV that goes over the wire, this one is the decoded audio sitting in a
 * browser tab, which is four bytes a sample rather than two.
 */
const DECODED_BYTES_PER_MS_PER_CHANNEL = (16_000 * 4) / 1000

/**
 * How many copies of the episode exist at once, at the worst moment.
 *
 * `decodeAudioData` yields an `AudioBuffer` with the source's own channel
 * count — two, for anything exported from an ordinary editor — and `toMono`
 * then allocates the mixdown while that buffer is still alive. Three
 * channels' worth, briefly, and the mixdown is the one that survives.
 *
 * A mono source costs a third of this: `toMono` hands back the channel it
 * was given rather than copying. Nothing can make the group export mono, so
 * the limit is set for the case that actually happens.
 */
const COPIES_AT_THE_PEAK = 3

/**
 * What one browser tab may be asked to hold.
 *
 * Chrome gives a tab a few gigabytes on a 64-bit desktop and far less on a
 * phone. Two is conservative for the first and hopeless for the second,
 * which is the honest trade: the group uploads from a laptop.
 */
const TAB_BUDGET_BYTES = 2_000_000_000

/**
 * The longest episode the browser can actually decode.
 *
 * Splitting happens in the browser, which means the whole episode is decoded
 * into memory before a single chunk is cut — so the binding limit on length
 * is a tab's memory, and it binds long before anything else does:
 *
 *   2 h 06 m, the show's own length   1.46 GB at the peak
 *   8 h, what the allowance permitted  5.53 GB — the tab simply dies
 *
 * The length check used to be against `DAILY_ALLOWANCE_MS`, on the reasoning
 * that an episode longer than a day's allowance could never finish. True,
 * and it let through four times what the browser can hold. The failure was a
 * tab disappearing with nothing said — no message, no row, no clue.
 *
 * Two hours fifty leaves the show's own two hours comfortable and refuses
 * what would have been a crash, with the message that already exists for it.
 */
export const MAX_EPISODE_MS = 170 * 60_000

/** What decoding an episode of this length costs at the worst moment. */
export function decodedBytesFor(durationMs: number): number {
  return durationMs * DECODED_BYTES_PER_MS_PER_CHANNEL * COPIES_AT_THE_PEAK
}

/** What a tab is allowed to hold, so a test can hold the two together. */
export const DECODE_BUDGET_BYTES = TAB_BUDGET_BYTES
