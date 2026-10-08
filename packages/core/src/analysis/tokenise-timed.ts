import type { TimedToken } from '../domain/token.js'
import type { TimedWord } from '../domain/timed-word.js'
import { normalize } from './normalize.js'
import { surfacesOf } from './tokenise.js'

/**
 * Turns a transcriber's timed words into the token stream, keeping the link
 * to the audio intact.
 *
 * Tokenising per word rather than over the joined text is what preserves that
 * link. Joining first and tokenising after would be simpler and would lose
 * the correspondence the moment a word split in two or dropped out — and the
 * mapping is the whole reason word-level timings were required in the first
 * place.
 */
export function tokeniseTimed(words: readonly TimedWord[]): TimedToken[] {
  const tokens: TimedToken[] = []

  for (const word of words) {
    for (const surface of surfacesOf(normalize(word.text))) {
      tokens.push({
        surface,
        index: tokens.length,
        startMs: word.startMs,
        endMs: word.endMs,
      })
    }
  }

  return tokens
}
