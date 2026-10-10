import type { AudioLanguage } from '../domain/audio-language.js'
import type { LemmaLookup } from '../domain/token.js'

export interface LemmaRepository {
  /**
   * Resolves many surface forms at once.
   *
   * Deliberately bulk. An episode holds a few thousand distinct forms, and
   * asking per token would be a few thousand round trips; asking once keeps
   * the dictionary in a database without the analysis ever touching one.
   * Forms with no entry are simply absent from the result.
   *
   * Scoped to a language, because a spelling is not unique across them.
   * `move` is the third person of `mover` in Portuguese and a verb of its
   * own in English; `come`, `serve` and `parte` are the same. An unscoped
   * lookup would hand the analysis the other language's answer for every one
   * of them.
   */
  lookup(forms: readonly string[], language: AudioLanguage): Promise<LemmaLookup>
}
