/**
 * The one place this tool reaches into the web app, named so it is obvious.
 *
 * Splitting an episode used to be browser-only for a single reason — it
 * decoded with `AudioContext` — while everything that decides *where* the
 * audio is cut is ordinary arithmetic: the loudness profile, moving each
 * seam into the nearest gap between words, and reporting where they settled
 * before any bytes go out. That ordering is load-bearing. Record the
 * boundaries after the upload, or swallow a failure to record them, and the
 * server offsets by the planned boundaries while the bytes follow different
 * ones: every timestamp after a seam wrong, every number still plausible.
 *
 * So the decoder was made an argument and this imports the original rather
 * than carrying a copy of it. A second copy is how the two would drift, and
 * the drift would not show up as a crash — it would show up as a transcript
 * that points at the wrong moment. The repo already calls this the
 * highest-risk code it has.
 *
 * A relative path, not a package import: `@overtone/web` is a Next
 * application with no `exports` map, and giving it one to satisfy a
 * command-line tool would be the tail wagging the dog. The dependency is
 * real either way, which is why it is written down here in one file instead
 * of scattered through the tool.
 */
export {
  splitAndUpload,
  type ChunkTarget,
  type DecodeAudio,
  type SplitProgress,
} from '../../../apps/web/src/audio/split-and-upload.js'

/**
 * What the transcriber resamples to anyway, and what the chunk arithmetic
 * is built on. Imported rather than restated: a tool that decoded at
 * another rate would cut every chunk in the wrong place.
 */
export { SAMPLE_RATE } from '../../../apps/web/src/audio/wav.js'

/**
 * The names of the session cookies.
 *
 * From the app, for the same reason as above: a second copy here would be a
 * second thing to keep in step on the one call that decides whether anything
 * works at all. Their own module in the app precisely so this import does
 * not pull `next/headers` into a CLI.
 *
 * The values cannot be derived — they are tokens the service mints — so they
 * are read from the sign-in response and a missing one is a hard failure.
 */
export { ACCESS_COOKIE, REFRESH_COOKIE } from '../../../apps/web/src/server/session-cookies.js'
