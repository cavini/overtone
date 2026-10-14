// US-050
//
// The directory against the show's real feed. The invented feed in the unit
// test is shaped the way feeds are; this is the one that proved the shape was
// wrong. Five of the first ten episodes came back titled from a different
// programme, and nothing in the unit suite could have said so.
//
// Skipped without OVERTONE_FEED_URL, because CI has none and the URL is a
// secret: a private feed carries its token in the path.
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RssEpisodeDirectory } from './rss-episode-directory.js'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const feedUrl = process.env['OVERTONE_FEED_URL']
const SHOW = 'Sun Your Balls'

if (feedUrl === undefined || feedUrl.length === 0) {
  describe('RssEpisodeDirectory, live', () => {
    it.skip('needs OVERTONE_FEED_URL', () => {})
  })
} else {
  // One instance, so the feed is fetched once for the whole file rather than
  // once per assertion. It is a few hundred kilobytes over somebody's
  // bandwidth.
  const directory = new RssEpisodeDirectory({ feedUrl, show: SHOW })

  describe('RssEpisodeDirectory, live', () => {
    it('reads the feed at all', async () => {
      expect((await directory.find(201))?.title).toMatch(/201/u)
    })

    /*
     * The ten the backfill starts with, and the regression that matters: this
     * feed publishes several programmes from one account, none of them set
     * `itunes:episode`, and nine numbers are claimed by more than one show.
     * Unscoped, 1 to 4 came back as "Chegou nos Normie" and 9 as "Porao do
     * Bunker" — a count filed under somebody else's episode, looking fine.
     */
    it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('finds episode %i of this show', async (number) => {
      const found = await directory.find(number)

      expect(found).toBeDefined()
      // Case-insensitively: the show wrote "Sun your balls" for its first
      // four episodes and "Sun Your Balls" after that.
      expect(found?.title.toLowerCase()).toContain(SHOW.toLowerCase())
      expect(found?.number).toBe(number)
    })

    // Proof the filter is doing something, rather than the feed happening to
    // be clean. Without a show these numbers belong to other programmes.
    it('is the filter, not luck', async () => {
      const unscoped = new RssEpisodeDirectory({ feedUrl })
      const titles = await Promise.all([1, 2, 3, 4, 9].map((n) => unscoped.find(n)))

      expect(titles.map((episode) => episode?.title)).not.toContain('Sun your balls #001')
    })
  })
}
