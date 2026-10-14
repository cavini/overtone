// US-050 · the list against the show's real feed
//
// The invented feed in the unit suite is shaped the way feeds are; this is
// the one that can say whether the real one carries enclosures where it is
// supposed to, and whether every episode of this show is reachable. A
// backfill walks this list unattended for days, so a gap in it is a gap in
// the library nobody notices.
//
// Reads a feed and nothing else. No transcription, no database, no bucket.
//
// Skipped without OVERTONE_FEED_URL, because CI has none and the URL is a
// secret: a private feed carries its token in the path.
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { describeEpisodeFeed } from '@overtone/core/testing'
import { RssEpisodeDirectory } from './rss-episode-directory.js'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const feedUrl = process.env['OVERTONE_FEED_URL']

/*
 * The real programme's name, from the environment.
 *
 * It cannot be a constant here: this suite asserts against the show's actual
 * feed, so an invented name would match nothing — and the real one does not
 * belong in the repository.
 */
const SHOW = process.env['OVERTONE_FEED_SHOW'] ?? ''

if (feedUrl === undefined || feedUrl.length === 0 || SHOW.length === 0) {
  describe('RssEpisodeDirectory list, live', () => {
    it.skip('needs OVERTONE_FEED_URL and OVERTONE_FEED_SHOW', () => {})
  })
} else {
  // One instance for the file, so the feed is fetched once rather than once
  // per assertion. It is a few hundred kilobytes over somebody's bandwidth.
  const feed = new RssEpisodeDirectory({ feedUrl, show: SHOW })

  describeEpisodeFeed('RssEpisodeDirectory, live', () =>
    Promise.resolve({ feed, show: SHOW }),
  )

  describe('RssEpisodeDirectory list, live', () => {
    /*
     * The ten the backfill starts with. They have to be in the list and in
     * the right order, because the list is the only thing deciding which
     * episode goes next and there is nobody watching.
     */
    it('starts at the beginning of the series', async () => {
      const first = (await feed.list()).slice(0, 10)

      expect(first.map((episode) => episode.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    })

    // Every number the lookup knows about and that has audio must be in the
    // list. The two answers come from one parse, and this is what says so.
    it('agrees with the lookup about what each episode is called', async () => {
      for (const episode of (await feed.list()).slice(0, 10)) {
        expect((await feed.find(episode.number))?.title).toBe(episode.title)
      }
    })
  })
}
