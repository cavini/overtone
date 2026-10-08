/**
 * One word of a transcript, as it will be counted.
 *
 * `surface` is the normalised spelling — what was actually said, after case
 * and edge punctuation are folded away but with diacritics intact. `index`
 * is the token's position in the episode's stream, which is what makes
 * phrase matching order-sensitive.
 */
export interface Token {
  readonly surface: string
  readonly index: number
}

/**
 * What the default view does with a token.
 *
 * `stopword` and `filler` are both hidden from "most said", but they are
 * different things: stop words are grammatical scaffolding, while fillers are
 * non-lexical noise whose *rate* is itself an interesting number. Nothing is
 * dropped from storage on the strength of this.
 */
export type TokenClass = 'word' | 'stopword' | 'filler'
