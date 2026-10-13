/**
 * The shortest gap that reads as a space between words.
 *
 * US-040 names 300 ms. Shorter than that is a stop consonant or a breath
 * taken mid-sentence, and cutting there is the bug this exists to avoid
 * rather than the fix.
 */
export const MIN_SILENCE_MS = 300

/**
 * How far a boundary may move to find a gap.
 *
 * US-040 names ninety seconds, and ninety does not fit. A chunk sits
 * between *two* seams, so it grows by twice this — and the planned length
 * has to leave room for all of it under the 25 MB request cap. Ninety each
 * side meant three extra minutes on a chunk with one minute of headroom.
 *
 * Forty-five, with `CHUNK_TARGET_MS` lowered to ten minutes to make room
 * for it. Conversation pauses for 300 ms many times a minute, so a
 * forty-five second window is not the binding constraint on finding a gap;
 * the request cap is.
 */
export const SEARCH_RADIUS_MS = 45_000

/**
 * How quiet a frame has to be to count as silence, against the recording's
 * own loudest moment.
 *
 * Relative, because nothing in a real recording is ever zero: there is room
 * tone, a preamp hiss, a laptop fan. An absolute threshold would find no
 * silence at all in a noisy room and every frame of a clean one.
 */
const QUIET_FRACTION = 0.2

export interface CutSearch {
  /** How much audio each entry of the profile covers. */
  readonly frameMs: number
  /** Where the plan says to cut. */
  readonly targetMs: number
  /** How far either side the cut may move. */
  readonly radiusMs: number
  /**
   * The recording's loudest frame, if it has already been measured.
   *
   * Every seam asks the same question of the same profile, so a caller
   * settling ten of them should measure once and pass it in.
   */
  readonly loudest?: number
}

/**
 * The loudest frame in a profile.
 *
 * A loop rather than `Math.max(...loudness)`: a two-hour episode at 20 ms
 * frames is 360 000 entries, and spreading that many arguments overflows
 * the call stack. The spread version passed every short test and would have
 * thrown on the first real upload.
 */
export function peakOf(loudness: readonly number[]): number {
  let peak = 0
  for (const level of loudness) if (level > peak) peak = level

  return peak
}

/**
 * Moves a chunk boundary to the middle of the nearest gap between words.
 *
 * Cutting at an arbitrary instant splits a word in two, and a transcriber
 * handed half a word returns a whole one it can pronounce — so the counts
 * gain a word nobody said, at every seam. A two-hour episode has about ten.
 *
 * Returns the target unchanged when there is no gap worth moving to, which
 * is the honest answer: an unbroken ninety seconds of speech has nowhere
 * better to be cut, and moving anyway would be worse.
 */
export function quietestCut(loudness: readonly number[], search: CutSearch): number {
  const { frameMs, targetMs, radiusMs } = search
  if (loudness.length === 0 || frameMs <= 0) return targetMs

  const loudest = search.loudest ?? peakOf(loudness)
  // Digital silence, or a profile with nothing in it. No gap is findable
  // because every frame is equally quiet.
  if (loudest <= 0) return targetMs

  const quietBelow = loudest * QUIET_FRACTION
  const minFrames = Math.ceil(MIN_SILENCE_MS / frameMs)

  const from = Math.max(0, Math.floor((targetMs - radiusMs) / frameMs))
  const to = Math.min(loudness.length - 1, Math.ceil((targetMs + radiusMs) / frameMs))

  let best: number | undefined
  let runStart: number | undefined

  // One pass, closing each run as it ends. The last run needs closing too,
  // which is why the loop runs one past the end.
  for (let frame = from; frame <= to + 1; frame += 1) {
    const quiet = frame <= to && (loudness[frame] ?? Number.POSITIVE_INFINITY) <= quietBelow

    if (quiet) {
      runStart ??= frame
      continue
    }

    if (runStart !== undefined) {
      if (frame - runStart >= minFrames) {
        // The middle of the gap, which leaves the most room on both sides
        // for the transcriber's own context.
        const middle = ((runStart + frame) / 2) * frameMs
        if (best === undefined || Math.abs(middle - targetMs) < Math.abs(best - targetMs)) {
          best = middle
        }
      }
      runStart = undefined
    }
  }

  return best ?? targetMs
}
