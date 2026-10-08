import type { TermCount, TermCounts } from '../domain/term.js'
import type { Token } from '../domain/token.js'
import { classify } from './classify.js'

export interface CountTermsOptions {
  /** `words` hides stop words and fillers, as the default view does. */
  readonly include?: 'words' | 'all'
}

/**
 * Ties are broken by code unit rather than by locale collation.
 *
 * `Intl.Collator` would order accented terms the way a Portuguese reader
 * expects, but its output depends on the ICU version bundled with the
 * runtime — so the same episode could rank two equal terms differently on
 * two machines. Counts must be reproducible, so ordering here is mechanical
 * and locale-aware sorting belongs to the presenter.
 */
function byCountThenTerm(a: TermCount, b: TermCount): number {
  if (b.count !== a.count) return b.count - a.count
  return a.term < b.term ? -1 : a.term > b.term ? 1 : 0
}

/**
 * Tallies a token stream.
 *
 * Every occurrence counts, including repeats within one sentence: saying it
 * twice is two mentions. Class totals cover the whole stream even when the
 * returned terms are filtered, so nothing is lost by hiding stop words —
 * they are absent from the view, not from the arithmetic.
 */
export function countTerms(
  tokens: readonly Token[],
  options: CountTermsOptions = {},
): TermCounts {
  const include = options.include ?? 'words'
  const tally = new Map<string, { count: number; forms: Set<string> }>()

  let wordTokens = 0
  let stopWordTokens = 0
  let fillerTokens = 0

  for (const token of tokens) {
    const tokenClass = classify(token.surface)

    if (tokenClass === 'word') wordTokens += 1
    else if (tokenClass === 'stopword') stopWordTokens += 1
    else fillerTokens += 1

    if (include === 'words' && tokenClass !== 'word') continue

    const entry = tally.get(token.surface) ?? { count: 0, forms: new Set<string>() }
    entry.count += 1
    entry.forms.add(token.surface)
    tally.set(token.surface, entry)
  }

  const terms: TermCount[] = [...tally]
    .map(([term, { count, forms }]) => ({
      term,
      count,
      surfaceForms: [...forms].sort(),
    }))
    .sort(byCountThenTerm)

  return {
    terms,
    totalTokens: tokens.length,
    wordTokens,
    stopWordTokens,
    fillerTokens,
    uniqueTerms: terms.length,
  }
}
