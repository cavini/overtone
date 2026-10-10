import type { TokenClass } from '../domain/token.js'
import { languagePack, type PackedLanguage } from './language-pack.js'

/**
 * Sorts a normalised token into the three buckets the UI treats differently.
 *
 * Expects normalised input: lookups are exact, so case and diacritics must
 * already be settled. Nothing is discarded on the strength of this — the
 * class decides what the default view hides, not what gets stored.
 *
 * Each language is sorted against its own lists, which is not a nicety: the
 * overlap between them is real and asymmetric. `que` is scaffolding in
 * Portuguese and meaningless in English, `the` is the reverse, and `era` is a
 * Portuguese stop word and an English noun. One merged list would hide a word
 * in whichever language it meant something in, and hide it invisibly — the
 * token is still stored and still counted, it simply never appears.
 */
export function classify(surface: string, language: PackedLanguage): TokenClass {
  const { fillers, stopWords } = languagePack(language)

  if (fillers.has(surface)) return 'filler'
  if (stopWords.has(surface)) return 'stopword'
  return 'word'
}
