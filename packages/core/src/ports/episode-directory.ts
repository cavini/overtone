/**
 * What the publisher says an episode is.
 *
 * A transcript says what was said. It cannot say who the guest was, what a
 * recurring bit is called, or how the group themselves described the
 * episode — all of which sits in the show's own feed.
 *
 * A port because looking it up means fetching and parsing somebody else's
 * XML, and nothing above this layer should know that.
 */
export interface PublishedEpisode {
  readonly number: number
  readonly title: string
  /** The show notes, as plain text. */
  readonly description: string
}

export interface EpisodeDirectory {
  /**
   * The published episode with this number, if the feed has one.
   *
   * `undefined` rather than a throw for "not in the feed": an episode the
   * feed has not published yet is an ordinary situation, not a failure.
   */
  find(episodeNumber: number): Promise<PublishedEpisode | undefined>
}
