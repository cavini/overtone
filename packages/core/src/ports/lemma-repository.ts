import type { LemmaLookup } from '../domain/token.js'

export interface LemmaRepository {
  /**
   * Resolves many surface forms at once.
   *
   * Deliberately bulk. An episode holds a few thousand distinct forms, and
   * asking per token would be a few thousand round trips; asking once keeps
   * the dictionary in a database without the analysis ever touching one.
   * Forms with no entry are simply absent from the result.
   */
  lookup(forms: readonly string[]): Promise<LemmaLookup>
}
