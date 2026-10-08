import type { Token } from '../domain/token.js'

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

const HAS_WORD_CHARACTER = /[\p{L}\p{N}]/u

/**
 * Peels trailing enclitics off a word, one at a time.
 *
 * Only the final hyphen-delimited segment is ever tested, which is why
 * compounds need no dictionary: `guarda-chuva` ends in `chuva`, and even
 * `bem-te-vi` — whose middle segment *is* a clitic — ends in `vi`.
 */
function splitEnclitics(word: string): string[] {
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

  return [head, ...clitics]
}

/**
 * The surfaces one stretch of text yields, in order.
 *
 * Shared by both tokenisers so the timed variant can never drift from the
 * plain one — a disagreement between them would mean counts and playback
 * referring to different words.
 *
 * Expects normalised text, but tolerates stray punctuation rather than
 * trusting its caller.
 */
export function surfacesOf(text: string): string[] {
  const surfaces: string[] = []

  for (const word of text.split(/\s+/)) {
    if (!HAS_WORD_CHARACTER.test(word)) continue

    for (const part of splitEnclitics(word)) {
      if (!HAS_WORD_CHARACTER.test(part)) continue
      surfaces.push(part)
    }
  }

  return surfaces
}

/** Splits normalised text into the token stream everything else counts over. */
export function tokenise(text: string): Token[] {
  return surfacesOf(text).map((surface, index) => ({ surface, index }))
}
