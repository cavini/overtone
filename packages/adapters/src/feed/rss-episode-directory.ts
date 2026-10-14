import type {
  EpisodeDirectory,
  EpisodeFeed,
  FeedEpisode,
  PublishedEpisode,
} from '@overtone/core'
import { readFeedItems } from './feed-items.js'

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

/**
 * What the publisher says, read from the show's own feed.
 *
 * The feed is fetched once and kept for the life of this instance. A feed
 * is a few hundred kilobytes and an upload looks up exactly one episode —
 * re-fetching per lookup would make enriching a back catalogue a download
 * per episode.
 *
 * Both ports, from the one cache. Looking an episode up and walking the
 * whole catalogue are different questions asked by different callers, but
 * they are the same XML parsed the same way, and a backfill asks both —
 * so the second must not be a second download, nor a second parser.
 */
export class RssEpisodeDirectory implements EpisodeDirectory, EpisodeFeed {
  private readonly feedUrl: string
  private readonly show: string | undefined
  private readonly fetch: typeof globalThis.fetch
  private published: Promise<Map<number, FeedEpisode>> | undefined

  constructor(options: RssEpisodeDirectoryOptions) {
    this.feedUrl = options.feedUrl
    this.show = options.show
    this.fetch = options.fetch ?? globalThis.fetch
  }

  private async load(): Promise<Map<number, FeedEpisode>> {
    const response = await this.fetch(this.feedUrl)
    if (!response.ok) {
      throw new Error(`feed: could not read it (${response.status})`)
    }

    return readFeedItems(await response.text(), this.show)
  }

  private episodes(): Promise<Map<number, FeedEpisode>> {
    this.published ??= this.load()

    return this.published
  }

  async find(episodeNumber: number): Promise<PublishedEpisode | undefined> {
    // A number that cannot be an episode never becomes a request.
    if (!Number.isInteger(episodeNumber) || episodeNumber <= 0) return undefined

    return (await this.episodes()).get(episodeNumber)
  }

  /**
   * Everything this show has published, oldest first.
   *
   * Sorted here rather than trusted from the feed: feeds list newest first,
   * but a back catalogue is worked through from the beginning, and nothing
   * in the format promises any order at all.
   *
   * An item with no enclosure is left out — there is no file to download,
   * so it is not something a caller of this can act on. It stays findable
   * by number, because a title is still a title.
   */
  async list(): Promise<readonly FeedEpisode[]> {
    return [...(await this.episodes()).values()]
      .filter((episode) => episode.audioUrl.length > 0)
      .sort((a, b) => a.number - b.number)
  }
}
