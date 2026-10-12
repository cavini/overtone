// US-039 · a share link opens in the recipient's language
//
// The shared page is the one screen a stranger ever sees, and it was
// hardcoded to pt — including `<html lang>`, which is what a screen reader
// uses to choose how to pronounce the words.
import { describe, expect, it } from 'vitest'
import { preferredLocale } from './preferred-locale.js'

describe('preferredLocale', () => {
  it.each([
    ['en-US,en;q=0.9', 'en'],
    ['pt-BR,pt;q=0.9,en;q=0.8', 'pt'],
    ['en', 'en'],
    ['pt', 'pt'],
  ])('reads %o as %o', (header, want) => {
    expect(preferredLocale(header)).toBe(want)
  })

  /*
   * pt-BR, not pt, because the show is Brazilian — but a browser asking for
   * European Portuguese still gets Portuguese rather than English. The
   * region is not what is being chosen here; the catalogue is.
   */
  it.each(['pt-PT', 'pt-BR', 'PT-br'])('treats %o as Portuguese', (header) => {
    expect(preferredLocale(header)).toBe('pt')
  })

  // The show is in Brazilian Portuguese, so that is the sensible default for
  // a reader we know nothing about.
  it.each([undefined, '', '   ', '*', 'de,fr;q=0.9', 'nonsense', ';;;'])(
    'falls back to Portuguese for %o',
    (header) => {
      expect(preferredLocale(header)).toBe('pt')
    },
  )

  /*
   * Quality matters, not order. A browser listing German first and English
   * second still prefers English when German is weighted lower — and we do
   * not speak German either way.
   */
  it('honours the weights rather than the order', () => {
    expect(preferredLocale('de;q=0.9,en;q=1.0')).toBe('en')
    expect(preferredLocale('en;q=0.2,pt;q=0.8')).toBe('pt')
    expect(preferredLocale('en;q=0.8,pt;q=0.2')).toBe('en')
  })

  /*
   * A broken weight still leaves a stated language. `en;q=nope` is not a
   * browser we have to serve — none sends it — but it says English plainly,
   * and discarding the whole entry over the number would answer in
   * Portuguese to a reader who asked for English. The tag wins; only the
   * weight is treated as absent.
   */
  it('keeps the language when only the weight is malformed', () => {
    expect(preferredLocale('en;q=nope')).toBe('en')
    expect(preferredLocale('pt;q=0.9,en;q=nope')).toBe('en')
  })

  // q=0 means "explicitly not this one", which is the opposite of a match.
  it('does not pick a language the browser refused', () => {
    expect(preferredLocale('en;q=0')).toBe('pt')
  })

  it('ignores whitespace and case the way the header allows', () => {
    expect(preferredLocale('  EN-GB ; q=0.9 ')).toBe('en')
  })
})
