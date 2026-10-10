// US-049
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RssEpisodeDirectory } from './rss-episode-directory.js'

/** An invented feed, shaped the way real ones are. */
const FEED = `<?xml version="1.0"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>A Show</title>
    <item>
      <title><![CDATA[Chuva de Canivetes #042]]></title>
      <itunes:episode>42</itunes:episode>
      <description><![CDATA[<p>Com <b>convidada</b>.</p><p>E outra coisa.</p>]]></description>
    </item>
    <item>
      <title>Sem numero marcado #017</title>
      <description>Notas &amp; coisas &lt;assim&gt;</description>
    </item>
    <item>
      <title>Episodio sem numero nenhum</title>
      <description>nada</description>
    </item>
    <item>
      <title>Regravado #042</title>
      <itunes:episode>42</itunes:episode>
      <description>uma regravacao posterior</description>
    </item>
  </channel>
</rss>`

let fetches: number
let respond: () => Response

const directoryOf = () => {
  fetches = 0
  const fetchImpl = vi.fn(() => {
    fetches += 1
    return Promise.resolve(respond())
  })
  return new RssEpisodeDirectory({
    feedUrl: 'https://feed.example/x',
    fetch: fetchImpl as unknown as typeof globalThis.fetch,
  })
}

beforeEach(() => {
  respond = () => new Response(FEED, { status: 200 })
})

describe('RssEpisodeDirectory', () => {
  it('finds an episode the publisher numbered', async () => {
    const found = await directoryOf().find(42)

    expect(found?.number).toBe(42)
    expect(found?.title).toBe('Chuva de Canivetes #042')
  })

  // Plenty of feeds never set `itunes:episode`, and the number is in the
  // title instead. Without this most shows could not be matched at all.
  it('falls back to a number in the title', async () => {
    expect((await directoryOf().find(17))?.title).toBe('Sem numero marcado #017')
  })

  it('ignores an item with no number anywhere', async () => {
    const directory = directoryOf()

    expect(await directory.find(1)).toBeUndefined()
    expect(await directory.find(999)).toBeUndefined()
  })

  // A feed lists newest first, and a later re-release under an old number
  // must not displace the episode everybody means by that number.
  it('keeps the first item for a number, not the last', async () => {
    expect((await directoryOf().find(42))?.title).toBe('Chuva de Canivetes #042')
  })

  describe('the show notes', () => {
    it('come back as text, not markup', async () => {
      const notes = (await directoryOf().find(42))?.description ?? ''

      expect(notes).not.toMatch(/<[a-z]/u)
      expect(notes).toContain('convidada')
    })

    it('keep the paragraph breaks', async () => {
      expect((await directoryOf().find(42))?.description).toContain('\n')
    })

    it('unescape the entities a feed is full of', async () => {
      expect((await directoryOf().find(17))?.description).toBe('Notas & coisas <assim>')
    })
  })

  /*
   * A feed is a few hundred kilobytes and an upload looks up one episode.
   * Fetching per lookup would make enriching a back catalogue one download
   * per episode.
   */
  it('reads the feed once however many episodes are asked for', async () => {
    const directory = directoryOf()
    await Promise.all([directory.find(42), directory.find(17), directory.find(42)])

    expect(fetches).toBe(1)
  })

  // A typo must not become traffic.
  it.each([0, -1, 1.5, Number.NaN])('refuses %o without asking the feed', async (number) => {
    const directory = directoryOf()
    expect(await directory.find(number)).toBeUndefined()
    expect(fetches).toBe(0)
  })

  it('says so when the feed cannot be read', async () => {
    respond = () => new Response('nope', { status: 503 })

    await expect(directoryOf().find(42)).rejects.toThrow(/could not read it \(503\)/u)
  })

  it('finds nothing in a feed with no items', async () => {
    respond = () => new Response('<rss><channel></channel></rss>', { status: 200 })

    expect(await directoryOf().find(42)).toBeUndefined()
  })
})
