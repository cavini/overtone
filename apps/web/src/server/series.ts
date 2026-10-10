import { getSeriesOverview, type SeriesOverview } from '@overtone/core'
import { DrizzleSeriesRepository } from '@overtone/db/repositories'
import { seriesFor } from './analyse-upload.js'
import { database } from './wiring.js'

/**
 * The whole series, as one answer.
 *
 * Reads stored per-episode aggregates rather than re-scanning transcripts, so
 * what it costs does not grow with the length of the archive.
 */
export async function seriesOverview(userId: string): Promise<SeriesOverview> {
  return getSeriesOverview(
    { seriesId: await seriesFor(userId) },
    { series: new DrizzleSeriesRepository(database(), userId) },
  )
}
