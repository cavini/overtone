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
 * The name of the session cookie, and how its value is derived.
 *
 * Both from the app, for the same reason as above. The cookie holds a hash
 * of the shared password rather than the password itself, and a second
 * implementation of that derivation would be a second thing to keep in step
 * with the gate — on the one call that decides whether anything works at
 * all. `gate.ts` is a pure module: a text encoder and a digest, no
 * framework anywhere near it.
 */
export { GATE_COOKIE, tokenFor } from '../../../apps/web/src/server/gate.js'
