import type { AudioChunk, ChunkTranscript } from '../domain/audio-chunk.js'
import type { TimedWord } from '../domain/timed-word.js'

/**
 * Twelve minutes.
 *
 * Two ceilings decide this, and the lower one wins:
 *
 * - **Duration.** A chunk must be far inside the 7 200-second hourly balance
 *   so it can never be refused for its length (ADR 0020). Twenty minutes
 *   cleared that comfortably.
 * - **Size.** The browser sends uncompressed 16 kHz mono audio, which runs at
 *   32 KB a second against a 25 MB file cap. That caps a chunk at about
 *   thirteen minutes, whatever the allowance allows.
 *
 * So twelve, with headroom on both. It was twenty while the splitting was
 * still hypothetical; actually building it turned a theoretical limit into
 * an arithmetic one.
 */
export const CHUNK_TARGET_MS = 12 * 60_000

/**
 * A remainder shorter than this is folded into the chunk before it.
 *
 * A twenty-second final chunk costs a round trip, a row, and a stitching seam
 * for almost no audio.
 */
export const MIN_TAIL_MS = 60_000

/**
 * Decides where to split an episode.
 *
 * Chunking exists because the free tier spends its hourly allowance on
 * **seconds of audio**: a real 2 h 06 m episode is 7 591 seconds against a
 * 7 200-second hour, so it cannot be transcribed as one request however small
 * the file is (ADR 0020). Splitting is not an optimisation; it is the only
 * way the episode goes through at all.
 *
 * These boundaries are a **target**. The browser moves each seam to the
 * middle of the nearest gap between words before cutting (`settleChunks`),
 * because a cut at an arbitrary instant lands mid-word most of the time and
 * a transcriber handed half a word returns a whole one it can pronounce —
 * a word nobody said, entering the counts at every seam.
 *
 * What comes back is therefore close to this plan rather than identical to
 * it. The settled list is reported before any audio is uploaded and stored
 * on the episode, and everything downstream offsets by that rather than by
 * this. `chunksFor` is where the two meet: a stored list stands in for the
 * plan entirely, and a missing one falls back to it.
 *
 * This comment claimed the same thing for a long time while nothing
 * implemented it (US-040). It is true now, and the test that holds it true
 * is `cuts-land-in-gaps.test.ts`, which runs real samples through the real
 * numeric path and asserts every seam ends up in a pause.
 */
/**
 * The longest episode that still fits in a single chunk.
 *
 * Until the browser can split audio, this is the longest file the app can
 * take at all — a longer one has to be cut before it is sent, and cutting it
 * by byte range would corrupt both halves.
 */
export const SINGLE_CHUNK_LIMIT_MS = CHUNK_TARGET_MS + MIN_TAIL_MS

export function planChunks(durationMs: number): AudioChunk[] {
  if (durationMs <= 0) return []

  const chunks: AudioChunk[] = []
  let startMs = 0

  while (startMs < durationMs) {
    const remaining = durationMs - startMs

    // Take the rest when what is left would otherwise leave a sliver behind.
    const endMs =
      remaining <= CHUNK_TARGET_MS + MIN_TAIL_MS ? durationMs : startMs + CHUNK_TARGET_MS

    chunks.push({ index: chunks.length, startMs, endMs })
    startMs = endMs
  }

  return chunks
}

/**
 * Reads back how an episode was actually split.
 *
 * `planChunks` answers "how should this be split", which is a different
 * question with a different answer the moment the target size changes — and
 * it did, from twenty minutes to twelve, once the browser started producing
 * uncompressed audio against a file cap. Re-deriving the plan for an
 * episode that is already transcribed then invents chunks nobody uploaded.
 *
 * The chunks that exist are the record. This reads the plan off them.
 */
export function planFromTranscripts(
  transcripts: readonly ChunkTranscript[],
  durationMs: number,
): AudioChunk[] {
  const inOrder = [...transcripts].sort((a, b) => a.index - b.index)

  return inOrder.map((chunk, position) => ({
    index: chunk.index,
    startMs: chunk.offsetMs,
    // Each chunk runs until the next one starts; the last runs to the end.
    // Clamped, because a duration shorter than the last offset would give a
    // chunk that ends before it began.
    endMs: Math.max(chunk.offsetMs, inOrder[position + 1]?.offsetMs ?? durationMs),
  }))
}

/**
 * Reassembles an episode's words from its chunks.
 *
 * Each chunk is transcribed on its own, so its timings start at zero. Adding
 * the offset the chunk actually began at is what turns them back into
 * positions in the episode.
 *
 * **This is the most dangerous code in the project, because it fails
 * silently.** An off-by-one in an offset does not throw and does not look
 * wrong: every count stays plausible while pointing at the wrong moment in
 * the audio, and the one thing this product promises is that a number can be
 * checked by listening to it. Hence the round-trip property test, which
 * splits a known transcript and demands the original back.
 *
 * Chunks are ordered by index rather than by arrival, because they are paced
 * against the allowance and may well finish out of order.
 */
export function stitchChunks(chunks: readonly ChunkTranscript[]): TimedWord[] {
  return [...chunks]
    .sort((a, b) => a.index - b.index)
    .flatMap((chunk) =>
      chunk.words.map((word) => ({
        text: word.text,
        startMs: word.startMs + chunk.offsetMs,
        endMs: word.endMs + chunk.offsetMs,
      })),
    )
}

/**
 * The same reassembly, for the transcriber's own boundaries.
 *
 * Its own function rather than a field on `stitchChunks`, which answers a
 * question about words — but the arithmetic is the same arithmetic and it
 * fails the same silent way, so it lives beside it where the warning is.
 */
export function stitchBoundaries(chunks: readonly ChunkTranscript[]): number[] {
  return [...chunks]
    .sort((a, b) => a.index - b.index)
    .flatMap((chunk) => (chunk.segmentStartsMs ?? []).map((start) => start + chunk.offsetMs))
}

/**
 * Which planned chunks have not come back.
 *
 * One failed chunk costs one chunk — but only if somebody notices. Analysing
 * a partial episode would under-report every number on the page and look
 * exactly like a finished one, which is the failure this product cannot
 * tolerate. So an episode is only complete when this is empty.
 */
export function missingChunks(
  plan: readonly AudioChunk[],
  transcribed: readonly ChunkTranscript[],
): number[] {
  const done = new Set(transcribed.map((chunk) => chunk.index))
  return plan.filter((chunk) => !done.has(chunk.index)).map((chunk) => chunk.index)
}
