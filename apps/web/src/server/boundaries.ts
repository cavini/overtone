import { planChunks } from '@overtone/core'
import { chunkTranscripts, episodes } from '@overtone/db/schema'
import { eq } from 'drizzle-orm'
import { database } from './wiring.js'
import { mustOwnEpisode } from './analyse-upload.js'

/** Why a reported set of boundaries was refused. */
export type BoundaryRefusal = 'WRONG_SHAPE' | 'ALREADY_STARTED'

/**
 * Records where the browser actually cut, before any chunk is transcribed.
 *
 * The planned boundaries are arithmetic on the duration and land mid-word
 * most of the time; the browser moves each seam into the nearest gap and
 * reports the result here (US-040). Everything downstream then offsets by
 * these rather than by the sum.
 *
 * Refused once a chunk has been transcribed. A chunk already carries an
 * offset taken from the boundaries in force when it ran, so changing them
 * afterwards would leave one episode holding both — some timestamps by the
 * plan and some by the settled list, all of them plausible. That is the
 * silent corruption this feature exists near, and it is cheaper to refuse
 * than to detect.
 */
export async function recordBoundaries(
  userId: string,
  episodeId: string,
  startsMs: readonly number[],
): Promise<{ ok: true } | { ok: false; refusal: BoundaryRefusal }> {
  await mustOwnEpisode(userId, episodeId)

  const db = database()
  const [episode] = await db
    .select({ durationMs: episodes.durationMs })
    .from(episodes)
    .where(eq(episodes.id, episodeId))
    .limit(1)

  if (episode === undefined) return { ok: false, refusal: 'WRONG_SHAPE' }

  if (!isPlausible(startsMs, episode.durationMs)) {
    return { ok: false, refusal: 'WRONG_SHAPE' }
  }

  const [started] = await db
    .select({ index: chunkTranscripts.index })
    .from(chunkTranscripts)
    .where(eq(chunkTranscripts.episodeId, episodeId))
    .limit(1)

  if (started !== undefined) return { ok: false, refusal: 'ALREADY_STARTED' }

  await db.update(episodes).set({ chunkStartsMs: [...startsMs] }).where(eq(episodes.id, episodeId))

  return { ok: true }
}

/**
 * Whether a reported list could describe this episode at all.
 *
 * Checked here rather than trusted, because it arrives from a browser and
 * every number in it becomes a timestamp somebody reads. One chunk too many
 * and the last one runs past the end of the audio; out of order and the
 * stitching walks backwards.
 */
export function isPlausible(startsMs: readonly number[], durationMs: number): boolean {
  if (startsMs.length !== planChunks(durationMs).length) return false
  if (startsMs[0] !== 0) return false

  return startsMs.every(
    (start, at) =>
      Number.isInteger(start) &&
      start >= 0 &&
      start < durationMs &&
      (at === 0 || start > (startsMs[at - 1] ?? 0)),
  )
}
