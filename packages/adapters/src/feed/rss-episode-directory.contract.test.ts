// US-049
//
// The port's own contract, run against the real adapter.
//
// It existed and was run against nothing — not a fake, not this. CLAUDE.md is
// explicit that a contract has to hold the real implementation as well as the
// stand-in, because a stand-in that is more forgiving makes every test built
// on it pass for a reason production does not share. A contract nobody invokes
// is the same problem with an extra step.
//
// A canned feed rather than the live one, so this stays a unit test: the live
// suite beside it covers the real feed, and this covers the contract.
import { describeEpisodeDirectory } from '@overtone/core/testing'
import { RssEpisodeDirectory } from './rss-episode-directory.js'

const FEED = `<?xml version="1.0"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>A Show</title>
    <item>
      <title><![CDATA[Chuva de Canivetes #042]]></title>
      <itunes:episode>42</itunes:episode>
      <description><![CDATA[<p>Com <b>convidada</b>.</p>]]></description>
    </item>
    <item>
      <title>Chuva de Canivetes #017</title>
      <description>Notas</description>
    </item>
  </channel>
</rss>`

describeEpisodeDirectory('RssEpisodeDirectory', () =>
  Promise.resolve({
    directory: new RssEpisodeDirectory({
      feedUrl: 'https://feed.example/x',
      fetch: (() =>
        Promise.resolve(
          new Response(FEED, { status: 200, headers: { 'content-type': 'application/rss+xml' } }),
        )) as unknown as typeof globalThis.fetch,
    }),
    known: 42,
    // A number the feed does not carry. Not an error — a clip, something
    // unpublished, a number nobody used.
    missing: 999,
  }),
)
