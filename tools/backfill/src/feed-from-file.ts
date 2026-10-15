import { readFile } from 'node:fs/promises'

/**
 * Reading the feed off disk instead of over the network.
 *
 * A `fetch` rather than a second way into the directory adapter, because the
 * adapter already takes one — so this needs no change to the thing that
 * parses feeds, and the parsing stays identical whichever way the bytes
 * arrive. Two code paths through that parser is how a saved copy would come
 * to disagree with a live one.
 *
 * Why it is wanted: the show's private feed URL began answering 401
 * mid-backfill, while the audio links inside the feed went on working. A
 * private feed is meant for one listener's podcast app, and a tool walking a
 * back catalogue asks for it on every run — so a saved copy is both the way
 * round an outage and the politer thing to do.
 */
export function feedFetch(filePath: string | undefined): typeof globalThis.fetch {
  if (filePath === undefined || filePath.length === 0) return globalThis.fetch

  return (async () => {
    /*
     * Not caught and turned into a failed response. "Could not read it" is
     * what a 401 already said, and it is what sent somebody looking at the
     * network — a missing file is a setup mistake and has to read like one.
     */
    const xml = await readFile(filePath, 'utf8').catch((cause: unknown) => {
      throw new Error(
        `could not read the feed from ${filePath}: ${cause instanceof Error ? cause.message : String(cause)}`,
      )
    })

    return new Response(xml, {
      status: 200,
      headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
    })
  }) as unknown as typeof globalThis.fetch
}
