import { episodeCorrections } from '@overtone/db/schema'
import { and, eq } from 'drizzle-orm'
import { advanceOnce, mustOwnEpisode } from './analyse-upload.js'
import { database } from './wiring.js'

/** The longest a corrected line may be. */
export const MAX_CORRECTION_CHARS = 2_000

/**
 * Whether a span could describe a line of this episode at all.
 *
 * Checked rather than trusted: it arrives from a browser and every number in
 * it becomes a timestamp somebody reads and a word somebody counts.
 */
export function isSensible(fromMs: number, toMs: number, text: string): boolean {
  return (
    Number.isInteger(fromMs) &&
    Number.isInteger(toMs) &&
    fromMs >= 0 &&
    toMs > fromMs &&
    text.length <= MAX_CORRECTION_CHARS
  )
}

/**
 * Records what was actually said, and re-derives everything from it.
 *
 * The re-analysis is the feature. A correction that only changed the text on
 * screen would leave the counts describing words nobody said — and the
 * counts are the entire product, so a transcript and a tally that disagree
 * is worse than the original mistake.
 *
 * It costs no transcription allowance: `advanceOnce` re-stitches and
 * re-analyses from the stored chunks, which is the same machinery that
 * backfills a new running joke across old episodes (US-026).
 */
export async function correctLine(
  userId: string,
  episodeId: string,
  fromMs: number,
  toMs: number,
  text: string,
): Promise<void> {
  await mustOwnEpisode(userId, episodeId)

  const said = text.trim()
  const db = database()

  /*
   * An empty correction is a deletion of the *correction*, not of the line:
   * typing a line back to what it was should leave no trace, rather than
   * leave an overlay that happens to match. Clearing the box entirely is how
   * somebody says "never mind".
   */
  if (said.length === 0) {
    await db
      .delete(episodeCorrections)
      .where(
        and(eq(episodeCorrections.episodeId, episodeId), eq(episodeCorrections.fromMs, fromMs)),
      )
  } else {
    await db
      .insert(episodeCorrections)
      .values({ episodeId, fromMs, toMs, text: said })
      // One per line. Editing the same line again replaces what was there,
      // rather than stacking two overlays on one stretch of audio.
      .onConflictDoUpdate({
        target: [episodeCorrections.episodeId, episodeCorrections.fromMs],
        set: { toMs, text: said },
      })
  }

  await advanceOnce(episodeId)
}
