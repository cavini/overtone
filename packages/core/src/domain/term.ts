/**
 * One counted thing, and the spellings that produced it.
 *
 * `surfaceForms` is what makes a count explicable. `falar 14` expands to
 * `falar 6 / falei 5 / falando 3`, which is what justifies the grouping to a
 * reader — and what lets someone spot a wrong merge and split it. A count
 * nobody can interrogate is a count nobody trusts.
 */
export interface TermCount {
  /** The lemma every contributing form was folded onto. */
  readonly term: string
  readonly count: number
  readonly surfaceForms: readonly string[]
  /**
   * True when at least one form was grouped by the stemmer rather than the
   * dictionary, so the UI can say so. Stemmed groupings can over-merge, and a
   * merge the user can see is a merge the user can correct.
   */
  readonly heuristic: boolean
}

/**
 * Everything the "most said" view needs for one episode.
 *
 * The three class totals are kept separately rather than derived, because
 * their sum is asserted against `totalTokens` — one invariant that catches
 * both double-counting and dropped tokens.
 */
export interface TermCounts {
  readonly terms: readonly TermCount[]
  readonly totalTokens: number
  readonly wordTokens: number
  readonly stopWordTokens: number
  readonly fillerTokens: number
  readonly uniqueTerms: number
}
