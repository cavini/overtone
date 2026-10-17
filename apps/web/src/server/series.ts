import {
  getSeriesOverview,
  type SeriesOverview,
  type SeriesTermTotal,
} from '@overtone/core'
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

/**
 * Twenty-five, which is a table to read rather than scroll.
 *
 * Asked of the database with the count it will show, so it orders and cuts in
 * one pass. Slicing in memory would mean moving every term of every episode —
 * about 180,000 rows once the archive is a hundred episodes deep — to return
 * twenty-five of them.
 */
const TOP_WORDS = 25

/**
 * The words said most across the whole series.
 *
 * Separate from the overview on purpose. The overview is fetched on every
 * page load and again after every upload; this is a folded table, so it is
 * totalled the first time somebody opens it and not before.
 */
export async function seriesWords(userId: string): Promise<readonly SeriesTermTotal[]> {
  const repository = new DrizzleSeriesRepository(database(), userId)

  return repository.topTerms(await seriesFor(userId), TOP_WORDS)
}
