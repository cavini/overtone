import { describe, expect, it } from 'vitest'
import { normalize } from './normalize.js'
import { FILLERS_EN, STOP_WORDS_EN } from './vocabulary-en.js'
import { FILLERS, STOP_WORDS } from './vocabulary.js'

describe('the English stop words', () => {
  it('covers the function words that dominate any frequency list', () => {
    for (const word of ['the', 'a', 'of', 'and', 'to', 'is', 'was', 'that', 'it', 'i', 'you']) {
      expect(STOP_WORDS_EN.has(word), word).toBe(true)
    }
  })

  /*
   * The tails contractions leave behind.
   *
   * The tokeniser splits `it's` into `it` and `s`, the way the Portuguese one
   * peels `-me` off `diga-me`. What reaches counting is `s`, `ve`, `ll`,
   * `re`, `d`, `m` — grammar rather than vocabulary, and noise at the top of
   * a frequency list if left countable.
   */
  it('covers what is left of a contraction once it is split', () => {
    for (const tail of ['s', 'd', 'm', 've', 'll', 're']) {
      expect(STOP_WORDS_EN.has(tail), tail).toBe(true)
    }
  })

  /*
   * Contracted negatives are kept whole instead.
   *
   * `n't` cannot be peeled off cleanly: `can't` and `won't` contract
   * irregularly, so removing the suffix leaves `ca` and `wo`. Every one of
   * them is an auxiliary plus a negation — scaffolding either way — so the
   * whole form is a stop word and the tokeniser never touches it.
   */
  it('covers the contracted negatives whole', () => {
    for (const word of ["don't", "can't", "won't", "didn't", "isn't", "wouldn't"]) {
      expect(STOP_WORDS_EN.has(word), word).toBe(true)
    }
  })

  // Whisper writes a typographic apostrophe about as often as a typewriter
  // one, and the two are different code points. A list holding only one
  // spelling would class half of them as countable words.
  it('covers both spellings of the apostrophe', () => {
    expect(STOP_WORDS_EN.has('don’t')).toBe(true)
    expect(STOP_WORDS_EN.has("don't")).toBe(true)
  })

  // The same judgement the Portuguese list makes about `tipo` and `cara`:
  // these are real words whose counts are the product, not scaffolding.
  it('leaves countable words countable', () => {
    for (const word of ['like', 'know', 'think', 'podcast', 'friend', 'money', 'game', 'love']) {
      expect(STOP_WORDS_EN.has(word), word).toBe(false)
    }
  })

  it('is not the Portuguese list by accident', () => {
    for (const word of ['que', 'não', 'para', 'você']) {
      expect(STOP_WORDS_EN.has(word), word).toBe(false)
    }
  })

  // Lookups are exact, so an entry that is not already normalised can never
  // match a token.
  it('is stored in the form tokens arrive in', () => {
    for (const word of [...STOP_WORDS_EN, ...FILLERS_EN]) {
      expect(normalize(word), word).toBe(word)
    }
  })
})

describe('the English fillers', () => {
  it('covers the non-lexical vocalisations', () => {
    for (const sound of ['uh', 'um', 'er', 'erm', 'hmm', 'mhm']) {
      expect(FILLERS_EN.has(sound), sound).toBe(true)
    }
  })

  /*
   * Excluded deliberately, for the reason the Portuguese list excludes `tipo`
   * and `né`: these are real words, and "you said *like* four hundred times
   * this season" is an insight rather than noise. Classing them as fillers
   * would fold them into a rate and remove them from the frequency list,
   * which is the one place someone would want to see them.
   */
  it('leaves discourse markers out, because they are words', () => {
    for (const word of ['like', 'right', 'well', 'so', 'actually', 'basically']) {
      expect(FILLERS_EN.has(word), word).toBe(false)
    }
  })

  it('does not also claim to be a stop word', () => {
    for (const sound of FILLERS_EN) {
      expect(STOP_WORDS_EN.has(sound), sound).toBe(false)
    }
  })
})

describe('the two languages', () => {
  // Each language is classified against its own list. Sharing a set would
  // mean a Portuguese stop word silently suppressed an English word, and the
  // overlap is real: `a`, `e`, `me`, `no`, `do`, `as` are function words in
  // both, and `era`, `tem`, `sem` are a stop word in one and a noun in the
  // other.
  it('keep separate lists', () => {
    expect(STOP_WORDS_EN).not.toBe(STOP_WORDS)
    expect(FILLERS_EN).not.toBe(FILLERS)
  })

  it('disagree, which is the whole reason there are two', () => {
    expect(STOP_WORDS.has('que')).toBe(true)
    expect(STOP_WORDS_EN.has('que')).toBe(false)
    expect(STOP_WORDS_EN.has('the')).toBe(true)
    expect(STOP_WORDS.has('the')).toBe(false)
  })
})
