import { episodes } from '@overtone/db/schema'
import { orphanedAudio } from './orphan-audio.js'
import { blobStore, database } from './wiring.js'

/** Everything the uploader writes lives under here. */
const AUDIO_PREFIX = 'episodes/'

/** What a sweep did, for the log and for the test. */
export type SweepReport =
  | { readonly swept: number }
  | { readonly skipped: 'no-live-episodes' }

/**
 * Deletes stored audio that belongs to no episode any more.
 *
 * Audio is removed once an episode is transcribed — the transcript is the
 * durable artifact (ADR 0005) — so what is left over belongs to an upload
 * that was interrupted or an episode somebody threw away. Nothing else can
 * find it: the database stopped mentioning it the moment the row went.
 *
 * Measured before this existed: two deleted episodes had left **43.9 MB**
 * behind, on a tier that holds a gigabyte. About forty-five abandoned
 * uploads would have filled it, and the symptom would have been uploads
 * failing for no visible reason.
 *
 * Safe to run against a library mid-upload: an episode's row is written
 * before its chunks are, so a chunk being uploaded right now always has an
 * episode to belong to.
 */
export async function sweepOrphanAudio(): Promise<SweepReport> {
  const blobs = blobStore()

  const stored = await blobs.list(AUDIO_PREFIX)
  const live = new Set((await database().select({ id: episodes.id }).from(episodes)).map((row) => row.id))

  const decision = orphanedAudio(stored, live)
  if ('refuse' in decision) return { skipped: decision.refuse }
  if (decision.sweep.length === 0) return { swept: 0 }

  await blobs.remove(decision.sweep)

  return { swept: decision.sweep.length }
}
