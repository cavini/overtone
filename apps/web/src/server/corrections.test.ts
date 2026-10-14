// US-049 · what a correction is allowed to say
//
// Every number here becomes a timestamp somebody reads and a word somebody
// counts, and all of it arrives from a browser.
import { describe, expect, it } from 'vitest'
import { MAX_CORRECTION_CHARS, isSensible } from './corrections.js'

describe('isSensible', () => {
  it('accepts a line of an episode', () => {
    expect(isSensible(0, 4_000, 'tô começando a sair de casa agora')).toBe(true)
  })

  // Clearing the box is how somebody takes a correction back.
  it('accepts an empty correction', () => {
    expect(isSensible(0, 4_000, '')).toBe(true)
  })

  it.each([
    ['a span that ends before it starts', 4_000, 1_000],
    ['a span of no length', 1_000, 1_000],
    ['a negative start', -1, 1_000],
    ['a fraction of a millisecond', 0.5, 1_000],
  ])('refuses %s', (_what, fromMs, toMs) => {
    expect(isSensible(fromMs, toMs, 'x')).toBe(false)
  })

  /*
   * A cap, because a correction is a line of speech rather than an essay —
   * and because the words in it are spread evenly across the line's own
   * span, so ten thousand of them would land several to the millisecond.
   */
  it('refuses more text than a line could hold', () => {
    expect(isSensible(0, 4_000, 'a'.repeat(MAX_CORRECTION_CHARS))).toBe(true)
    expect(isSensible(0, 4_000, 'a'.repeat(MAX_CORRECTION_CHARS + 1))).toBe(false)
  })
})
