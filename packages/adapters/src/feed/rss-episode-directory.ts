import type { EpisodeDirectory, PublishedEpisode } from '@overtone/core'

export interface RssEpisodeDirectoryOptions {
  readonly feedUrl: string
  /**
   * Which show in the feed, when the feed carries more than one.
   *
   * A collective publishes every programme it makes from one account, so a
   * single feed holds several shows — and since almost nobody sets
   * `itunes:episode`, the number has to be read from the title, where the
   * shows collide. One real feed has nine numbers claimed by two or more
   * programmes.
   *
   * Matched against the start of the title, case-insensitively: a long back
   * catalogue will have changed its own capitalisation at some point.
   *
   * Absent means every item counts, which is right for a feed with one show
   * in it.
   */
  readonly show?: string
  readonly fetch?: typeof globalThis.fetch
}

/** Between the markers, with CDATA unwrapped. */
function between(xml: string, tag: string): string | undefined {
  const match = new RegExp(
    `<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`,
    'u',
  ).exec(xml)

  return match?.[1]
}

/** Show notes are HTML. The product deals in text. */
function asPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<\/p>/giu, '\n\n')
    .replace(/<[^>]+>/gu, '')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

/**
 * Which episode an item is.
 *
 * `itunes:episode` when the publisher sets it, which is the only reliable
 * answer. Failing that, a number in the title — podcasts overwhelmingly put
 * it there, and a feed without either cannot be matched at all.
 */
function numberOf(item: string): number | undefined {
  const tagged = between(item, 'itunes:episode')
  if (tagged !== undefined && /^\d+$/u.test(tagged.trim())) return Number(tagged.trim())

  const title = between(item, 'title') ?? ''
  const inTitle = /#?(\d{1,4})\b/u.exec(title)

  return inTitle?.[1] === undefined ? undefined : Number(inTitle[1])
}

/**
 * What the publisher says, read from the show's own feed.
 *
 * The feed is fetched once and kept for the life of this instance. A feed
 * is a few hundred kilobytes and an upload looks up exactly one episode —
 * re-fetching per lookup would make enriching a back catalogue a download
 * per episode.
 */
export class RssEpisodeDirectory implements EpisodeDirectory {
  private readonly feedUrl: string
  private readonly show: string | undefined
  private readonly fetch: typeof globalThis.fetch
  private published: Promise<Map<number, PublishedEpisode>> | undefined

  constructor(options: RssEpisodeDirectoryOptions) {
    this.feedUrl = options.feedUrl
    this.show = options.show?.trim().toLowerCase()
    this.fetch = options.fetch ?? globalThis.fetch
  }

  /** Whether this item belongs to the show we were told to read. */
  private mine(title: string): boolean {
    return this.show === undefined || title.trim().toLowerCase().startsWith(this.show)
  }

  private async load(): Promise<Map<number, PublishedEpisode>> {
    const response = await this.fetch(this.feedUrl)
    if (!response.ok) {
      throw new Error(`feed: could not read it (${response.status})`)
    }

    const xml = await response.text()
    const episodes = new Map<number, PublishedEpisode>()

    for (const [item] of xml.matchAll(/<item\b[\s\S]*?<\/item>/gu)) {
      const number = numberOf(item)
      if (number === undefined) continue

      const title = asPlainText(between(item, 'title') ?? '')

      // Another programme in the same feed. Skipped before the first-wins
      // check below, because otherwise it claims the number and the episode
      // we are actually looking for is the one discarded.
      if (!this.mine(title)) continue

      // First wins. A feed lists newest first, and a re-release of an old
      // number should not overwrite the episode everybody means.
      if (episodes.has(number)) continue

      episodes.set(number, {
        number,
        title,
        description: asPlainText(
          between(item, 'content:encoded') ?? between(item, 'description') ?? '',
        ),
      })
    }

    return episodes
  }

  async find(episodeNumber: number): Promise<PublishedEpisode | undefined> {
    // A number that cannot be an episode never becomes a request.
    if (!Number.isInteger(episodeNumber) || episodeNumber <= 0) return undefined

    this.published ??= this.load()

    return (await this.published).get(episodeNumber)
  }
}
