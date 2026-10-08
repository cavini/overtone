import type { TermCount, TermCounts } from '../domain/term.js'
import type { AnnotatedToken } from '../domain/token.js'

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
 * Tallies an annotated token stream by lemma.
 *
 * Every occurrence counts, including repeats within one sentence: saying it
 * twice is two mentions. Class totals cover the whole stream even when the
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
