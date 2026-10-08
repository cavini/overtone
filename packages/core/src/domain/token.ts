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
