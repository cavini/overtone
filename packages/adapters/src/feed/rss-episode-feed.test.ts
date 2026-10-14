// US-050 · the feed read as a list rather than a lookup
//
// `find(number)` answers "what is this episode called", which is what an
// upload needs. Walking the back catalogue needs the other question: what is
// in here, and where is each file. Same feed, same parsing, same instance —
// a second parser would drift from the first and the two would disagree
// about which show an item belongs to.
import { describe, expect, it, vi } from 'vitest'
import { describeEpisodeFeed } from '@overtone/core/testing'
import { RssEpisodeDirectory } from './rss-episode-directory.js'

/**
 * An invented feed with enclosures, which real ones always carry — it is
 * what a podcast app downloads.
 *
 * Newest first, as feeds are, and with one item that has no audio at all:
 * a trailer page, a note, something unpublished.
 */
const FEED = `<?xml version="1.0"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>The Collective</title>
    <item>
      <title><![CDATA[Chuva de Canivetes #003]]></title>
      <description>o terceiro</description>
      <enclosure url="https://cdn.example/sun-3.mp3?t=abc&amp;x=1" length="98765432" type="audio/mpeg"/>
      <itunes:duration>7591</itunes:duration>
    </item>
    <item>
      <title>Outro Programa #002</title>
      <description>outro programa</description>
      <enclosure url="https://cdn.example/normie-2.mp3" length="1" type="audio/mpeg"/>
    </item>
    <item>
      <title>Chuva de Canivetes #002</title>
      <description>o segundo</description>
      <enclosure url="https://cdn.example/sun-2.mp3" type="audio/mpeg"/>
    </item>
    <item>
      <title>Chuva de canivetes #001</title>
      <description>o primeiro</description>
      <enclosure url="https://cdn.example/sun-1.mp3" length="12345" type="audio/mpeg"/>
    </item>
    <item>
      <title>Chuva de Canivetes #004</title>
      <description>sem audio nenhum</description>
    </item>
  </channel>
</rss>`

const SHOW = 'Chuva de Canivetes'

let fetches: number

const feedOf = (show: string | undefined = SHOW) => {
  fetches = 0
  const fetchImpl = vi.fn(() => {
    fetches += 1
    return Promise.resolve(new Response(FEED, { status: 200 }))
  })

  return new RssEpisodeDirectory({
    feedUrl: 'https://feed.example/x',
    ...(show === undefined ? {} : { show }),
    fetch: fetchImpl as unknown as typeof globalThis.fetch,
  })
}

describe('listing what the feed publishes', () => {
  it('hands back the audio url, which is the whole point of listing', async () => {
    const [first] = await feedOf().list()

    expect(first?.number).toBe(1)
    expect(first?.audioUrl).toBe('https://cdn.example/sun-1.mp3')
  })

  /*
   * Oldest first, because that is the order a back catalogue is worked
   * through: a feed lists newest first, and starting there would leave the
   * beginning of the series for last.
   */
  it('counts up, not down', async () => {
    expect((await feedOf().list()).map((episode) => episode.number)).toEqual([1, 2, 3])
  })

  it('reads only the named show, as find does', async () => {
    const titles = (await feedOf().list()).map((episode) => episode.title)

    expect(titles.every((title) => title.toLowerCase().startsWith('chuva de canivetes'))).toBe(true)
  })

  /*
   * An item with no enclosure cannot be downloaded, so it is not something
   * this can offer. It stays findable by number — a title is still a title.
   */
  it('leaves out an item with no audio', async () => {
    const feed = feedOf()

    expect((await feed.list()).map((episode) => episode.number)).not.toContain(4)
    expect((await feed.find(4))?.title).toBe('Chuva de Canivetes #004')
  })

  // `&amp;` in an attribute is how XML spells `&`. Left escaped, the URL is
  // a 404 — and the token of a private feed lives in exactly that part.
  it('unescapes the url the way xml escaped it', async () => {
    const third = (await feedOf().list()).at(-1)

    expect(third?.audioUrl).toBe('https://cdn.example/sun-3.mp3?t=abc&x=1')
  })

  it('carries what the publisher says it weighs', async () => {
    const [first] = await feedOf().list()

    expect(first?.audioBytes).toBe(12345)
  })

  // Plenty of feeds omit `length`. Zero rather than a guess: nothing here
  // needs the size, and a made-up one would be believed.
  it('says nothing about a size the feed does not give', async () => {
    const second = (await feedOf().list())[1]

    expect(second?.audioBytes).toBe(0)
  })

  it('keeps the show notes it already read', async () => {
    expect((await feedOf().list())[0]?.description).toBe('o primeiro')
  })

  /*
   * One fetch for the pair of them. The lookup caches the parsed feed for
   * the life of the instance, and listing has to share that cache rather
   * than start its own — a backfill that listed and then looked up every
   * episode would otherwise download the feed once per episode.
   */
  it('reads the feed once, however it is asked', async () => {
    const feed = feedOf()
    await Promise.all([feed.list(), feed.find(1), feed.list()])

    expect(fetches).toBe(1)
  })

  it('finds nothing in a feed with nothing in it', async () => {
    const empty = new RssEpisodeDirectory({
      feedUrl: 'https://feed.example/x',
      fetch: (() =>
        Promise.resolve(new Response('<rss><channel></channel></rss>', { status: 200 }))) as unknown as typeof globalThis.fetch,
    })

    expect(await empty.list()).toEqual([])
  })
})

describeEpisodeFeed('RssEpisodeDirectory', () =>
  Promise.resolve({ feed: feedOf(), show: SHOW }),
)
