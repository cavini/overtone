/**
 * One counted thing, and the spellings that produced it.
 *
 * `surfaceForms` is what makes a count explicable. Today a term is keyed by
 * its surface so the list holds one entry, but once inflections are grouped
 * (`falar`, `falei`, `falando` → one term) this is what the UI shows to
 * justify the grouping — and what lets someone spot a wrong merge and split
 * it. A count nobody can interrogate is a count nobody trusts.
 */
export interface TermCount {
  readonly term: string
  readonly count: number
  readonly surfaceForms: readonly string[]
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
