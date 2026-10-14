// US-052 · an account is an email and a password
import { describe, expect, it } from 'vitest'
import { checkPassword, MIN_PASSWORD_CHARS } from './password-rules.js'

describe('checkPassword', () => {
  it('accepts one long enough', () => {
    expect(checkPassword('uma senha comprida')).toBeUndefined()
  })

  it('refuses one too short, and says how long it has to be', () => {
    expect(checkPassword('curta')).toEqual({
      code: 'PASSWORD_TOO_SHORT',
      min_chars: MIN_PASSWORD_CHARS,
    })
  })

  it('accepts one exactly at the limit', () => {
    expect(checkPassword('a'.repeat(MIN_PASSWORD_CHARS))).toBeUndefined()
  })

  it('refuses one character under it', () => {
    expect(checkPassword('a'.repeat(MIN_PASSWORD_CHARS - 1))?.code).toBe('PASSWORD_TOO_SHORT')
  })

  it('refuses nothing at all', () => {
    expect(checkPassword('')?.code).toBe('PASSWORD_TOO_SHORT')
  })

  /*
   * Counted in characters a person would recognise, not in UTF-16 units.
   * `'ação'` is four characters and eight bytes, and an emoji is one
   * character that `.length` calls two — so a password that looks long
   * enough must not be refused, and one that looks short must not pass.
   */
  it('counts what a person would count', () => {
    // Ten code points, which `.length` would call twenty.
    expect(checkPassword('🔑'.repeat(MIN_PASSWORD_CHARS))).toBeUndefined()
    // Five code points, which `.length` would call ten and let through.
    expect(checkPassword('🔑'.repeat(5))?.code).toBe('PASSWORD_TOO_SHORT')
  })

  /*
   * Spaces are part of a password — a passphrase is mostly spaces — so they
   * are never trimmed. But a password made only of them is somebody who has
   * not typed one, and it must not be accepted just for being long.
   */
  it('refuses one that is only whitespace', () => {
    expect(checkPassword(' '.repeat(MIN_PASSWORD_CHARS + 4))?.code).toBe('PASSWORD_NEEDS_CONTENT')
  })

  it('keeps the spaces inside a passphrase', () => {
    expect(checkPassword('o gato  subiu  no telhado')).toBeUndefined()
  })
})
