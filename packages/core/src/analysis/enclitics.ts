/**
 * Enclitic pronouns, which attach to a verb with a hyphen and are separate
 * words: `diga-me`, `fazê-lo`, `dá-se`.
 *
 * The list is closed, and `o a os as` are deliberately absent. As enclitics
 * they are real, but they are indistinguishable from the second half of a
 * compound without a dictionary, so the conservative reading wins and
 * `dá-o` stays one token. Being occasionally too cautious costs a count on a
 * pronoun nobody is counting; being too eager would shred compounds.
 */
const ENCLITICS: ReadonlySet<string> = new Set([
  'me', 'te', 'se', 'lhe', 'lho', 'nos', 'vos',
  'lo', 'la', 'los', 'las', 'no', 'na',
])

const TRAILING_PUNCTUATION = /[^\p{L}\p{N}]+$/u

/**
 * Peels trailing enclitics off a word, one at a time.
 *
 * Only the final hyphen-delimited segment is ever tested, which is why
 * compounds need no dictionary: `guarda-chuva` ends in `chuva`, and even
 * `bem-te-vi` — whose middle segment *is* a clitic — ends in `vi`.
 */
export function splitEnclitics(word: string): string[] {
  const clitics: string[] = []
  let head = word

  for (;;) {
    const hyphen = head.lastIndexOf('-')
    if (hyphen <= 0) break

    const tail = head.slice(hyphen + 1)
    if (!ENCLITICS.has(tail)) break

    clitics.unshift(tail)
    head = head.slice(0, hyphen)
  }

  /*
   * `diga--me` leaves `diga-`, and a trailing hyphen makes it a different
   * term from the same verb written cleanly — two buckets for one word.
   *
   * `normalize` trims punctuation at the *edges* of a token, so a lone
   * `diga-` never arrives here; a doubled inner hyphen does, because its
   * edges are letters. Rare — there is none in the episode we have — but
   * the tokeniser's stated position is that it tolerates stray punctuation
   * rather than trusting its caller, and this is the same promise one layer
   * down.
   */
  return [head.replace(TRAILING_PUNCTUATION, ''), ...clitics]
}
