/**
 * Where to listen to an episode to find out what language it is in.
 *
 * The language used to be declared: whatever the interface happened to be
 * set to when the file was dropped became the episode's language for good
 * (ADR 0022). That is a property of whoever was reading, not of the audio,
 * and it is wrong in the ordinary case — somebody reading in English
 * uploading the show's Portuguese episode got an English transcript of
 * Portuguese speech, counted against English stop words.
 *
 * So it is heard instead of declared. What makes that harder than it
 * sounds is where the listening happens.
 */

/**
 * How much audio one probe covers.
 *
 * Thirty seconds because that is precisely what the detector reads: Whisper
 * identifies the language from a single 30-second window. A shorter probe
 * is padded out to this length anyway, and a longer one is charged for in
 * full — the allowance is spent in seconds of audio — and then ignored past
 * the first half minute.
 */
export const PROBE_MS = 30_000

/**
 * How many places to listen before deciding.
 *
 * One window is one mid-roll sting or one long English anecdote away from
 * deciding the whole episode, and the decision is not a label: it picks the
 * stop-word list, the stemmer and the half of the dictionary that every
 * count is then computed from (ADR 0023). Wrong, it reports `the` and `of`
 * as the most-said words of a Portuguese episode, or `que` and `não` as
 * terms of an English one — plausibly, and with nothing on screen to say
 * so.
 *
 * Three that have to agree cost 90 seconds of a 7 200-second hour and turn
 * one unlucky passage into a minority.
 */
export const PROBE_COUNT = 3

/** One window of audio to be identified, never stored and never stitched. */
export interface LanguageProbe {
  readonly startMs: number
  readonly endMs: number
}

/**
 * Picks the windows, deliberately away from both ends.
 *
 * **The opening is the one place that must never be sampled.** The show
 * opens on music with English lyrics, so a detector pointed at the start of
 * the file answers "English" for every episode the group has ever recorded
 * — confidently, because it is right about the thirty seconds it was given.
 * The same goes for whatever closes the episode.
 *
 * Fractions of the duration rather than a fixed margin, so there is no
 * constant here that has to be revised when the intro is re-cut. At the
 * show's own length the three windows land roughly half an hour apart, far
 * inside the conversation.
 */
export function planLanguageProbes(durationMs: number): LanguageProbe[] {
  if (durationMs <= 0) return []

  /*
   * Fewer windows rather than overlapping ones.
   *
   * Three probes need four probe-lengths to sit in with gaps between them.
   * Short audio that cannot hold them would otherwise get three windows
   * reading the same passage, which is not three opinions — it is one
   * opinion counted three times, with the confidence of a majority.
   */
  const count = Math.min(PROBE_COUNT, Math.max(1, Math.floor(durationMs / PROBE_MS) - 1))

  return Array.from({ length: count }, (_, at) => {
    const centreMs = (durationMs * (at + 1)) / (count + 1)

    // Clamped so a clip shorter than one window is still listened to once,
    // rather than probed at a negative offset or past its own end.
    const startMs = Math.max(0, Math.min(centreMs - PROBE_MS / 2, durationMs - PROBE_MS))

    return { startMs, endMs: Math.min(durationMs, startMs + PROBE_MS) }
  })
}
