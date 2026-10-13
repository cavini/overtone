import type { TermCount, TermCounts } from '../domain/term.js'
import type { AnnotatedToken } from '../domain/token.js'
import { compareByCountThenLabel } from './ranking.js'

export interface CountTermsOptions {
  /** `words` hides stop words and fillers, as the default view does. */
  readonly include?: 'words' | 'all'
}

interface Tally {
  count: number
  readonly forms: Set<string>
  heuristic: boolean
}

/**
 * Tallies an annotated token stream by lemma.
 *
 * Every occurrence counts, including repeats within one sentence: saying it
 * twice is two mentions. Class totals cover the whole stream even when the
 * One pass and one `Map`, so it is linear in the tokens and indifferent to
 * how many distinct terms there are: 0.4 ms over a two-hour episode. The
 * sort at the end is over distinct terms rather than tokens, which is a few
 * thousand against twenty.
 *
 * returned terms are filtered, so nothing is lost by hiding stop words —
 * they are absent from the view, not from the arithmetic, and their sum
 * against `totalTokens` is the invariant that catches miscounting.
 */
export function countTerms(
  tokens: readonly AnnotatedToken[],
  options: CountTermsOptions = {},
): TermCounts {
  const include = options.include ?? 'words'
  const tally = new Map<string, Tally>()

  let wordTokens = 0
  let stopWordTokens = 0
  let fillerTokens = 0

  for (const token of tokens) {
    if (token.tokenClass === 'word') wordTokens += 1
    else if (token.tokenClass === 'stopword') stopWordTokens += 1
    else fillerTokens += 1

    if (include === 'words' && token.tokenClass !== 'word') continue

    const entry = tally.get(token.lemma) ?? {
      count: 0,
      forms: new Set<string>(),
      heuristic: false,
    }

    entry.count += 1
    entry.forms.add(token.surface)
    if (token.lemmaSource === 'stemmer') entry.heuristic = true

    tally.set(token.lemma, entry)
  }

  const terms: TermCount[] = [...tally]
    .map(([term, { count, forms, heuristic }]) => ({
      term,
      count,
      surfaceForms: [...forms].sort(),
      heuristic,
    }))
    .sort((a, b) =>
      compareByCountThenLabel(
        { count: a.count, label: a.term },
        { count: b.count, label: b.term },
      ),
    )

  return {
    terms,
    totalTokens: tokens.length,
    wordTokens,
    stopWordTokens,
    fillerTokens,
    uniqueTerms: terms.length,
  }
}
