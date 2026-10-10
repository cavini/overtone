import type { Token } from '../domain/token.js'
import { languagePack, type PackedLanguage } from './language-pack.js'

const HAS_WORD_CHARACTER = /[\p{L}\p{N}]/u

/**
 * The surfaces one stretch of text yields, in order.
 *
 * Shared by both tokenisers so the timed variant can never drift from the
 * plain one — a disagreement between them would mean counts and playback
 * referring to different words.
 *
 * The language decides how a written-together word comes apart: Portuguese
 * peels enclitics off a hyphen, English peels clitics off an apostrophe.
 * Running either rule on the other language leaves words joined that should
 * be counted separately, so there is no default — the caller says which.
 *
 * Expects normalised text, but tolerates stray punctuation rather than
 * trusting its caller.
 */
export function surfacesOf(text: string, language: PackedLanguage): string[] {
  const { splitWord } = languagePack(language)
  const surfaces: string[] = []

  for (const word of text.split(/\s+/)) {
    if (!HAS_WORD_CHARACTER.test(word)) continue

    for (const part of splitWord(word)) {
      if (!HAS_WORD_CHARACTER.test(part)) continue
      surfaces.push(part)
    }
  }

  return surfaces
}

/** Splits normalised text into the token stream everything else counts over. */
export function tokenise(text: string, language: PackedLanguage): Token[] {
  return surfacesOf(text, language).map((surface, index) => ({ surface, index }))
}
