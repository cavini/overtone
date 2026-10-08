import type { TokenClass } from '../domain/token.js'
import { FILLERS, STOP_WORDS } from './vocabulary.js'

/**
 * Sorts a normalised token into the three buckets the UI treats differently.
 *
 * Expects normalised input: lookups are exact, so case and diacritics must
 * already be settled. Nothing is discarded on the strength of this — the
 * class decides what the default view hides, not what gets stored.
 */
export function classify(surface: string): TokenClass {
  if (FILLERS.has(surface)) return 'filler'
  if (STOP_WORDS.has(surface)) return 'stopword'
  return 'word'
}
