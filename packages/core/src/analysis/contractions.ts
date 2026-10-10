/**
 * Clitics that attach to a word with an apostrophe and are separate words:
 * `it's`, `they've`, `we'll`, `I'd`, `I'm`.
 *
 * The list is closed, and `t` is deliberately absent. `n't` is a clitic too,
 * but `can't` and `won't` contract irregularly — peeling the suffix leaves
 * `ca` and `wo`, invented words sitting near the top of a frequency list. A
 * contracted negative is an auxiliary plus a negation either way, so the
 * whole form is an English stop word and the tokeniser leaves it alone.
 */
const CLITICS: ReadonlySet<string> = new Set(['s', 've', 'll', 're', 'd', 'm'])

/**
 * Both code points, because a transcriber writes either one.
 *
 * Normalisation settles case and edge punctuation but not this: U+2019 is a
 * letter-like apostrophe to Unicode and NFC leaves it exactly where it is.
 * Matching only the typewriter form would leave half the contractions joined
 * — and which half depends on the transcriber, which is the worst kind of
 * dependency for a count.
 */
const APOSTROPHES = ["'", '’']

const HAS_WORD_CHARACTER = /[\p{L}\p{N}]/u

const lastApostrophe = (word: string): number =>
  Math.max(...APOSTROPHES.map((mark) => word.lastIndexOf(mark)))

/**
 * Peels trailing clitics off a word, one at a time.
 *
 * Only the final apostrophe-delimited segment is ever tested, which is what
 * lets `o'clock`, `y'all` and `rock'n'roll` through untouched: each ends in
 * something that is not a clitic. The head must keep a letter or a digit, so
 * a stray apostrophe can never split a word into nothing.
 *
 * The shape deliberately mirrors the Portuguese enclitic splitter. Same
 * problem — a written-together word that is two counted words — and keeping
 * the two readable side by side is worth more than sharing the code, which
 * would have to be parameterised on the separator, the list and the
 * direction before it fitted both.
 */
export function splitContractions(word: string): string[] {
  const clitics: string[] = []
  let head = word

  for (;;) {
    const apostrophe = lastApostrophe(head)
    if (apostrophe <= 0) break

    const tail = head.slice(apostrophe + 1)
    if (!CLITICS.has(tail)) break

    const remaining = head.slice(0, apostrophe)
    if (!HAS_WORD_CHARACTER.test(remaining)) break

    clitics.unshift(tail)
    head = remaining
  }

  return [head, ...clitics]
}
