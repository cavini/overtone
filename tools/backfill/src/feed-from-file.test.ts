// US-050
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { feedFetch } from './feed-from-file.js'

const FEED = '<rss><channel><title>A Show</title></channel></rss>'

const aFileHolding = async (xml: string): Promise<string> => {
  const where = await mkdtemp(join(tmpdir(), 'overtone-feed-'))
  const path = join(where, 'feed.xml')
  await writeFile(path, xml, 'utf8')
  return path
}

describe('feedFetch', () => {
  it('hands back the real fetch when no file is named', () => {
    expect(feedFetch(undefined)).toBe(globalThis.fetch)
    expect(feedFetch('')).toBe(globalThis.fetch)
  })

  /*
   * The reason this exists. The show's private feed URL started answering
   * 401 mid-backfill — a token rotated or an abuse rule tripped — while the
   * audio links in the feed went on working. A saved copy is enough to
   * finish the catalogue, and it is one fewer request against a feed that
   * is meant for a listener rather than a tool.
   */
  it('reads the feed off disk when one is', async () => {
    const path = await aFileHolding(FEED)

    const response = await feedFetch(path)('https://ignored.example/feed')

    expect(response.ok).toBe(true)
    expect(await response.text()).toBe(FEED)
  })

  // Whatever URL the adapter was built with is irrelevant once a file is
  // named — it must not quietly fall back to the network.
  it('ignores the url entirely', async () => {
    const path = await aFileHolding(FEED)

    const response = await feedFetch(path)('https://private.example/does-not-exist')

    expect(await response.text()).toBe(FEED)
  })

  /*
   * A missing file is a setup mistake and must say so. Answering it like a
   * failed request would surface as "feed: could not read it", which is the
   * message that sent somebody looking at the network in the first place.
   */
  it('says which file it could not read', async () => {
    await expect(feedFetch('/no/such/feed.xml')('https://ignored.example')).rejects.toThrow(
      /\/no\/such\/feed\.xml/u,
    )
  })

  it('answers with xml, so the adapter parses it the same way', async () => {
    const path = await aFileHolding(FEED)

    const response = await feedFetch(path)('https://ignored.example')

    expect(response.headers.get('content-type')).toMatch(/xml/u)
  })
})
