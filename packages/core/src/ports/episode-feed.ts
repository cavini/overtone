import type { PublishedEpisode } from './episode-directory.js'

/**
 * A published episode and where its audio actually is.
 *
 * `EpisodeDirectory` answers a question about one episode somebody already
 * has — what is it called, what did the group say about it. This is the
 * other direction: what the feed holds, and the enclosure URL for each,
 * which is the only thing in a feed that is a file rather than a label.
 */
export interface FeedEpisode extends PublishedEpisode {
  /** The `<enclosure url>` — a plain HTTP download. */
  readonly audioUrl: string
  /**
   * What the publisher says the file weighs, or `0` when it does not say.
   *
   * Zero rather than optional or a guess: plenty of feeds omit `length`,
   * nothing downstream needs it to be right, and a number invented here
   * would be believed by whatever read it.
   */
  readonly audioBytes: number
}

/**
 * Everything a show has published, in the order it was published.
 *
 * A separate port from `EpisodeDirectory` rather than a method on it,
 * because it is a different capability with a different caller: the app
 * looks one episode up as it accepts an upload, and only a back-catalogue
 * walk ever needs the whole list. One adapter can satisfy both, and the RSS
 * one does.
 */
export interface EpisodeFeed {
  /**
   * The published episodes, **oldest first**, skipping any with no audio.
   *
   * Oldest first because that is the order a back catalogue is worked
   * through, and a feed's own order is the opposite — starting there would
   * leave the beginning of the series for last.
   *
   * An item with no enclosure is left out: there is no file to fetch, so it
   * is not something this can offer. It stays findable by number.
   */
  list(): Promise<readonly FeedEpisode[]>
}
