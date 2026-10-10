/**
 * Finding where something was said.
 *
 * A port because the searching is the database's job and the deciding is
 * not: Postgres knows how to stem Portuguese and how to use an index, and
 * the use case above it knows that five hits ten seconds apart are one
 * conversation rather than five answers.
 */
export interface TranscriptMatch {
  readonly episodeId: string
  readonly episodeNumber: number
  readonly episodeTitle: string
  readonly startMs: number
  readonly endMs: number
  /** What was said there, for showing the reader why it matched. */
  readonly text: string
}

export interface TranscriptSearch {
  /**
   * Segments matching the words, across every episode.
   *
   * `limit` bounds the work, not the answer: a word said four hundred times
   * does not need four hundred rows to tell someone where the conversation
   * about it was.
   */
  search(query: string, limit: number): Promise<readonly TranscriptMatch[]>
}
