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
 * A token that knows where it was said.
 *
 * Several tokens can share one span: `diga-me` is one spoken word and two
 * tokens, and both point at the same moment, because that is when it was
 * said. Splitting the span between them would invent precision the
 * transcript never offered.
 */
export interface TimedToken extends Token {
  readonly startMs: number
  readonly endMs: number
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

/**
 * Where a token's lemma came from, so a grouping can always be justified.
 *
 * `dictionary` is exact. `stemmer` is a heuristic the UI marks as such, since
 * it can over-group. `surface` means nothing was found and the word stands
 * for itself — a visible gap, which is strictly better than a silent merge.
 */
export type LemmaSource = 'dictionary' | 'stemmer' | 'surface'

/** What annotation adds to a token. */
export interface Annotation {
  readonly lemma: string
  readonly lemmaSource: LemmaSource
  readonly tokenClass: TokenClass
}

/**
 * Annotation is additive, so a timed token stays timed.
 *
 * Expressed as an intersection rather than a fixed interface because the
 * alternative loses the audio timings halfway down the pipeline — and those
 * timings are the only thing connecting a count to a moment someone can play
 * back.
 */
export type Annotated<T extends Token> = T & Annotation

/** A token with everything counting needs attached. */
export type AnnotatedToken = Annotated<Token>

/**
 * Surface form to lemma.
 *
 * Passed into the analysis rather than fetched by it: the caller performs one
 * bulk query for the episode's distinct forms and hands the result over, so
 * the analysis stays a pure function with no database underneath it.
 */
export type LemmaLookup = ReadonlyMap<string, string>
