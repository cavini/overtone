/**
 * What a password has to be before it is worth sending anywhere.
 *
 * Checked here rather than left to the service, so the refusal is ours: a
 * message code with its parameters, rendered in whichever language the
 * reader is using (ADR 0017). The service's own minimum is lower and its
 * answer arrives in English.
 */

/**
 * Ten characters.
 *
 * A floor, not advice. This is a small group's library behind one form with
 * no rate limit of its own yet, so the thing that matters is that a password
 * cannot be four digits — not that it contains a symbol. Composition rules
 * push people towards `Senha123!` and away from the long phrases that are
 * actually hard to guess, so there are none.
 */
export const MIN_PASSWORD_CHARS = 10

export type PasswordProblem =
  | { readonly code: 'PASSWORD_TOO_SHORT'; readonly min_chars: number }
  | { readonly code: 'PASSWORD_NEEDS_CONTENT' }

/**
 * What is wrong with a password, or nothing.
 *
 * Never trimmed. A passphrase is mostly spaces and they are as much a part
 * of it as the letters — trimming would silently sign somebody in with a
 * different password than the one they set.
 */
export function checkPassword(password: string): PasswordProblem | undefined {
  /*
   * Spread rather than `.length`, which counts UTF-16 units: an emoji is
   * one character it calls two, so `.length` would let a five-character
   * password through and refuse a ten-character one.
   */
  if ([...password].length < MIN_PASSWORD_CHARS) {
    return { code: 'PASSWORD_TOO_SHORT', min_chars: MIN_PASSWORD_CHARS }
  }

  // Long, but nothing was typed. Spaces count inside a password and not as
  // the whole of one.
  if (password.trim().length === 0) return { code: 'PASSWORD_NEEDS_CONTENT' }

  return undefined
}
