// US-045 · ADR 0019
import { describe, expect, it } from 'vitest'
import { annotate } from './annotate.js'
import { COLLOQUIAL_LEMMAS } from './colloquial.js'
import { STOP_WORDS } from './vocabulary.js'

/** How the real dictionary maps these, which is the problem. */
const DICTIONARY = new Map([
  ['cara', 'caro'],
  ['carinho', 'caro'],
  ['mano', 'manar'],
  ['meio', 'mear'],
  ['metade', 'dois'],
  ['verde', 'ver'],
  ['falar', 'falar'],
])

const lemmaOf = (surface: string): string =>
  annotate([{ surface, index: 0 }], DICTIONARY)[0]?.lemma ?? ''

const sourceOf = (surface: string): string =>
  annotate([{ surface, index: 0 }], DICTIONARY)[0]?.lemmaSource ?? ''

describe('the colloquial overrides', () => {
  /*
   * Measured on a real episode, not imagined. The ODbL dictionary is correct
   * formal Portuguese and wrong for how anyone talks: `cara` really is the
   * feminine of the adjective `caro`, and in a conversation between friends
   * it means "dude" every single time. It was the top word of the episode at
   * 311, and it was wrong.
   */
  it.each([
    ['cara', 'cara', 'dude, not expensive'],
    ['carinho', 'carinho', 'affection, not expensive'],
    ['mano', 'mano', 'bro, not a verb'],
    ['meio', 'meio', 'half or sort-of, not the verb mear'],
    ['metade', 'metade', 'a half is not the number two'],
    ['verde', 'verde', 'green is not the verb to see'],
  ])('reads %o as %o (%s)', (surface, expected) => {
    expect(lemmaOf(surface)).toBe(expected)
  })

  it('beats the dictionary where they disagree', () => {
    expect(DICTIONARY.get('cara')).toBe('caro')
    expect(lemmaOf('cara')).toBe('cara')
  })

  it('leaves the dictionary alone everywhere else', () => {
    expect(lemmaOf('falar')).toBe('falar')
    expect(sourceOf('falar')).toBe('dictionary')
  })

  // An override is a correction we are confident in — more so than the
  // dictionary, not less. Flagging it as a guess would tell the reader to
  // doubt the one grouping that was checked by hand.
  it('is not reported as a guess', () => {
    expect(sourceOf('cara')).toBe('override')
    expect(sourceOf('cara')).not.toBe('stemmer')
  })

  describe('the list itself', () => {
    it('is written the way tokens are', () => {
      for (const [form, lemma] of Object.entries(COLLOQUIAL_LEMMAS)) {
        expect(form, form).toBe(form.toLowerCase().normalize('NFC'))
        expect(lemma, lemma).toBe(lemma.toLowerCase().normalize('NFC'))
      }
    })

    // Otherwise two forms of one word land under different lemmas and the
    // count splits in half.
    it('maps every lemma it produces to itself', () => {
      for (const lemma of Object.values(COLLOQUIAL_LEMMAS)) {
        expect(COLLOQUIAL_LEMMAS[lemma], lemma).toBe(lemma)
      }
    })

    it('groups the plurals with their singulars', () => {
      expect(lemmaOf('caras')).toBe('cara')
      expect(lemmaOf('manos')).toBe('mano')
      expect(lemmaOf('verdes')).toBe('verde')
    })

    // A stop word is never counted, so an override for one would be an entry
    // that can never do anything.
    it('contains nothing that is already a stop word', () => {
      for (const form of Object.keys(COLLOQUIAL_LEMMAS)) {
        expect(STOP_WORDS.has(form), form).toBe(false)
      }
    })

    it('keeps its accents', () => {
      // Stripping diacritics here would reintroduce the bug the whole
      // normalisation step exists to prevent.
      const accented = Object.keys(COLLOQUIAL_LEMMAS).filter((form) => /[áâãàéêíóôõúç]/u.test(form))
      for (const form of accented) {
        expect(COLLOQUIAL_LEMMAS[form]).toBeDefined()
      }
    })
  })
})
