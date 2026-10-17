/**
 * Finding where something was said.
 *
 * A port because the searching is the database's job and the deciding is
 * not: Postgres knows how to stem Portuguese and how to use an index, and
 * the use case above it knows that five hits ten seconds apart are one
 * conversation rather than five answers.
 */
/** Wraps each matching word. Control characters: no transcript contains them. */
export const MATCH_OPEN = '\u0002'
export const MATCH_CLOSE = '\u0003'

export interface TranscriptMatch {
  readonly episodeId: string
  readonly episodeNumber: number
  readonly episodeTitle: string
  readonly startMs: number
  readonly endMs: number
  /** What was said there, for showing the reader why it matched. */
  readonly text: string
  /**
   * The same text with the matching words marked.
   *
   * Marked by the database, not by the page, because only the database
   * knows *why* a segment matched: the search stems, so a query for `ano`
   * matches `anos` and a query for `falar` matches `falou`. Highlighting by
   * string comparison in the browser would bold neither, and would quietly
   * bold the wrong thing in the cases it did hit.
   *
   * Delimited with control characters rather than markup, so the page can
   * split on them and emit its own elements. Nothing has to trust, or
   * sanitise, HTML built in SQL.
   */
  readonly highlighted: string
  /**
   * How many lines matched in that episode altogether.
   *
   * Not how many came back. The budget samples across each episode, so a
   * word said three hundred times returns a handful — and without this the
   * page cannot tell somebody that the rest exist. A search that shows part
   * of the answer and says nothing is the failure this product can least
   * afford.
   */
  readonly episodeMatches: number
}

export interface TranscriptSearch {
  /**
   * Segments matching the words, across every episode.
   *
   * `perEpisode` bounds the work, not the answer: a word said four hundred
   * times does not need four hundred rows to tell someone where the
   * conversation about it was.
   *
   * **Per episode, and that is the whole point.** It was one flat budget
   * spent busiest-episode-first, which sounds like a ranking and behaves
   * like a cliff: measured on a real library, one episode's 321 matching
   * lines took all 300 rows and the other fourteen episodes were never
   * looked at. The answer read as "it was only said in that one episode",
   * which is the failure this product cannot afford — a wrong answer that
   * looks like a right one.
   *
   * Bounding each episode instead costs no more. Returning every match for
   * a very common word measured 66 ms against 62 ms for 300 rows: the work
   * is the index scan, and the rows were the cheap half.
   */
  /**
   * `seriesId` is not optional, and that is deliberate.
   *
   * Search reads every stored segment there is. Once there is more than one
   * library, an unscoped search is one person reading another's transcripts
   * — so the scope is a required argument rather than a filter a caller
   * might forget.
   */
  search(seriesId: string, query: string, perEpisode: number): Promise<readonly TranscriptMatch[]>
}
