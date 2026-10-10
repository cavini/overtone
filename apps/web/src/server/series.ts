import { getSeriesOverview, type SeriesOverview } from '@overtone/core'
import { DrizzleSeriesRepository } from '@overtone/db/repositories'
import { M0_OWNER, sharedSeriesId } from './analyse-upload.js'
import { database } from './wiring.js'

/**
 * The whole series, as one answer.
 *
 * Reads stored per-episode aggregates rather than re-scanning transcripts, so
 * what it costs does not grow with the length of the archive.
 */
export async function seriesOverview(): Promise<SeriesOverview> {
  return getSeriesOverview(
    { seriesId: await sharedSeriesId() },
    // One shared library with one owner, until accounts exist (M0 in the
    // roadmap). The repository still asks, because the predicate it checks is
    // the one that will matter the moment there is more than one group.
    { series: new DrizzleSeriesRepository(database(), M0_OWNER) },
  )
}
