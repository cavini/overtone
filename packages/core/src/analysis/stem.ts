import { STOP_WORDS } from './vocabulary.js'

/**
 * Nouns that end in `s` in the singular. Mostly academic here, since any of
 * these would be found in the lemma dictionary long before the fallback is
 * reached — but a stemmer that turns `lápis` into `lápi` is wrong in a way
 * that is hard to notice, so the guard is cheap insurance.
 */
const INVARIANT: ReadonlySet<string> = new Set([
  'lápis', 'ônibus', 'vírus', 'atlas', 'bônus', 'ânus', 'cais', 'pires',
])

/**
 * Plural endings, longest first so that `-ões` is tried before `-s`.
 *
 * Deliberately absent: `-is`/`-eis`/`-ais`, where the singular is ambiguous
 * (`fuzis`→`fuzil` but `lápis`→`lápis`), and `-ses`, where the singular
 * usually carries an accent we cannot restore (`meses`→`mês`).
 */
const PLURALS: ReadonlyArray<readonly [suffix: string, replacement: string]> = [
  ['ões', 'ão'],
  ['ães', 'ão'],
  ['ãos', 'ão'],
  ['res', 'r'],
  ['zes', 'z'],
  ['ns', 'm'],
  ['s', ''],
]

const MIN_INPUT = 4
const MIN_RESULT = 3

/**
 * Reduces a word to a grouping key when the lemma dictionary has no entry for
 * it. This runs only on out-of-vocabulary tokens, which in practice means
 * names, slang, in-jokes and English borrowings — so plurals are the whole
 * job.
 *
 * It does not attempt verb conjugation, and that restraint is the point. A
 * general-purpose Portuguese stemmer folds `comer` to `com`, collapsing a
 * common verb into a preposition and promoting a stop word to the top of the
 * frequency list. Mapping `falei` back to `falar` requires a dictionary;
 * guessing at it would trade visible gaps for invisible wrong numbers.
 *
 * Two guards make a bad reduction impossible rather than unlikely: the result
 * must still be a plausible word, and it must never be a stop word. When
 * either fails, the original survives untouched — being occasionally too
 * cautious costs a grouping, while being too eager costs the count's
 * credibility.
 */
export function stem(surface: string): string {
  if (surface.length < MIN_INPUT) return surface
  if (INVARIANT.has(surface)) return surface
  if (!surface.endsWith('s')) return surface

  for (const [suffix, replacement] of PLURALS) {
    if (!surface.endsWith(suffix)) continue

    const candidate = surface.slice(0, -suffix.length) + replacement
    if (candidate.length < MIN_RESULT) return surface
    if (STOP_WORDS.has(candidate)) return surface

    return candidate
  }

  return surface
}
