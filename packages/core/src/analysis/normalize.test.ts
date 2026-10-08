// US-004 · domain decision D2
import { describe, expect, it } from 'vitest'
import { normalize } from './normalize.js'

describe('normalize', () => {
  it('lowercases', () => {
    expect(normalize('OLÁ')).toBe('olá')
  })

  it('strips punctuation from the edges but not the middle', () => {
    expect(normalize('olá,')).toBe('olá')
    expect(normalize('...café!')).toBe('café')
    expect(normalize('«pirão»')).toBe('pirão')
    expect(normalize("d'água")).toBe("d'água")
    expect(normalize('diga-me')).toBe('diga-me')
  })

  it('composes decomposed sequences to NFC', () => {
    const decomposed = 'café' // e + combining acute
    expect(decomposed.normalize('NFD')).not.toBe('café'.normalize('NFC'))
    expect(normalize(decomposed)).toBe('café')
    expect(normalize(decomposed)).toHaveLength(4)
  })

  // The single most dangerous habit to import from an English pipeline.
  // Stripping diacritics merges words that mean entirely different things.
  it('preserves diacritics', () => {
    expect(normalize('é')).toBe('é')
    expect(normalize('está')).toBe('está')
    expect(normalize('pôr')).toBe('pôr')
    expect(normalize('ação')).toBe('ação')
    expect(normalize('você')).toBe('você')
  })

  it.each([
    ['e', 'é'],      // and / is
    ['por', 'pôr'],  // by / to put
    ['esta', 'está'], // this / is
    ['as', 'às'],    // the / at the
    ['pode', 'pôde'], // can / could
  ])('keeps %s and %s distinct', (plain, accented) => {
    expect(normalize(plain)).not.toBe(normalize(accented))
  })

  it('collapses internal whitespace and trims', () => {
    expect(normalize('  o   pirão  ')).toBe('o pirão')
  })

  it('returns an empty string for input with no word characters', () => {
    expect(normalize('')).toBe('')
    expect(normalize('...')).toBe('')
    expect(normalize('   ')).toBe('')
  })

  it('is idempotent', () => {
    const once = normalize('«Você ESTÁ aí?»')
    expect(normalize(once)).toBe(once)
  })
})
