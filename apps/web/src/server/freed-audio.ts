import type { AdvanceEpisodeOutcome } from '@overtone/core'

/**
 * Where an episode's chunk audio lives in the bucket.
 *
 * One place, because two things need to agree on it: whatever uploads a
 * chunk and whatever deletes it. A key built twice is a key that can differ
 * once, and the failure is invisible — the upload succeeds, the delete
 * silently removes nothing, and the bucket fills up.
 */
export const chunkKey = (episodeId: string, index: number): string =>
  `episodes/${episodeId}/chunk-${index}.wav`

/**
 * Which of an episode's chunk audio an advance has turned into dead weight.
 *
 * Freeing per chunk rather than per episode is what keeps several uploads
 * from colliding on the 1 GB tier. Transcription is paced against an
 * allowance that refills at two audio-seconds a wall-second, so a 2h06m
 * episode's thirteen chunks drain over an hour or more — and at ~19 MB a
 * chunk, three episodes uploaded back to back (the daily cap) would hold
 * ~729 MB of audio at once while they waited their turn. Freeing each chunk
 * as it lands keeps the peak at whatever is still untranscribed.
 *
 * The audio is safe to drop the instant the transcript is stored: the next
 * run reads `transcribedIndexes` and never asks for that chunk's URL again,
 * and re-derivation reads `transcripts.raw_provider_payload`, not audio.
 *
 * `failed` and `waiting` free nothing, which is the point of the function —
 * see the tests. Both states expect to be retried, and a retry needs its
 * bytes.
 */
export function freedAudio(
  episodeId: string,
  outcome: AdvanceEpisodeOutcome,
  chunkCount: number,
): readonly string[] {
  if (outcome.state === 'transcribed') return [chunkKey(episodeId, outcome.chunkIndex)]

  /*
   * A sweep, not the main path. By the time an episode is ready every chunk
   * has already been freed one at a time — this catches the exceptions: a
   * removal that failed, and episodes transcribed before per-chunk freeing
   * existed. Removing what is already gone is the outcome it wanted.
   */
  if (outcome.state === 'ready') {
    return Array.from({ length: chunkCount }, (_, index) => chunkKey(episodeId, index))
  }

  return []
}
