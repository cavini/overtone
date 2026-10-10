import { STOP_WORDS_EN } from './vocabulary-en.js'

/**
 * Words that end in `s` without being a plural, and that the rules below
 * cannot rule out on spelling alone.
 *
 * `-ss`, `-us` and `-is` are handled as rules rather than listed, which is
 * what keeps this list to a handful: `class`, `virus` and `basis` need no
 * entry. What remains is the awkward residue — `series` and `species` end in
 * `-ies`, `physics` in `-cs`, and both would otherwise be cut.
 */
const INVARIANT: ReadonlySet<string> = new Set([
  'news', 'series', 'species', 'means', 'physics', 'mathematics', 'politics',
  'economics', 'ethics', 'athletics', 'gas', 'lens', 'plus', 'bias', 'canvas',
  'atlas', 'chaos', 'jeans', 'pants', 'scissors', 'glasses', 'headphones',
])

/**
 * Endings whose `s` is never a plural marker.
 *
 * `-ves` is here rather than a reduction rule because the singular is not
 * recoverable from the spelling: `knives` needs `fe` and `wolves` needs `f`,
 * and the published dictionary holds both. Guessing would trade a visible
 * gap for an invisible wrong answer.
 */
const NOT_A_PLURAL = ['ss', 'us', 'is', 'ves']

/**
 * Endings where dropping `es` is unambiguous, because no English word ends
 * in `-xe` or `-she`.
 *
 * Deliberately absent: `-ses`, `-zes` and `-ches`, where the same spelling
 * comes from both a bare `s` and an `es` plural — `houses`/`buses`,
 * `prizes`/`quizzes`, `caches`/`pitches`. Those fall through to the bare `s`
 * rule, which is right for the first of each pair and harmless for the
 * second, since the dictionary holds every one of them.
 */
const SIBILANT_PLURALS = ['xes', 'shes']

const MIN_INPUT = 4
const MIN_RESULT = 3

/**
 * Applies one reduction, or declines to.
 *
 * Both guards exist to make a bad reduction impossible rather than unlikely:
 * the result must still be a plausible word, and it must never be a stop
 * word. Declining costs a grouping; a bad reduction costs the count's
 * credibility.
 */
function reduce(surface: string, suffix: string): string {
  const candidate = surface.slice(0, -suffix.length)

  if (candidate.length < MIN_RESULT) return surface
  if (STOP_WORDS_EN.has(candidate)) return surface

  return candidate
}

/**
 * Reduces an English word to a grouping key when the dictionary has no entry
 * for it.
 *
 * Plurals, and nothing else — the same restraint the Portuguese stemmer
 * shows, for the same reason. Verb morphology would mean taking `-ing` and
 * `-ed`, which folds `running` to `runn` and merges `interested` with
 * `interest`; the published list already maps `run` to `ran`, `running` and
 * `runs`, which is the part no stemmer can do. What reaches this function is
 * what no dictionary holds: names, slang, in-jokes and the vocabulary a
 * podcast invents, where a plural is the only inflection that shows up.
 *
 * Stop words are refused outright. The English list holds inflected
 * auxiliaries ending in `s` — `does`, `has`, `its` — and `does` would
 * otherwise reduce to `doe`, which is not a stop word, so an auxiliary the
 * default view hides would reappear as a visible term. The Portuguese
 * stemmer needs no such guard, because every plural stop word it can reach
 * reduces to another stop word and its check on the result catches them.
 */
export function stemEnglish(surface: string): string {
  if (surface.length < MIN_INPUT) return surface
  if (!surface.endsWith('s')) return surface
  if (STOP_WORDS_EN.has(surface)) return surface
  if (INVARIANT.has(surface)) return surface

  for (const ending of NOT_A_PLURAL) {
    if (surface.endsWith(ending)) return surface
  }

  for (const ending of SIBILANT_PLURALS) {
    if (surface.endsWith(ending)) return reduce(surface, 'es')
  }

  return reduce(surface, 's')
}
