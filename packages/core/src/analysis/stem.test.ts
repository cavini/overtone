// US-016 · domain decision D4
import { describe, expect, it } from 'vitest'
import { stem } from './stem.js'
import { STOP_WORDS } from './vocabulary.js'

describe('stem', () => {
  // The realistic job: plurals of words a Portuguese dictionary will not
  // contain — names, slang, in-jokes, English borrowings.
  it.each([
    ['hotdogs', 'hotdog'],
    ['podcasts', 'podcast'],
    ['memes', 'meme'],
    ['lives', 'live'],
    ['casas', 'casa'],
  ])('reduces the plural %s to %s', (plural, singular) => {
    expect(stem(plural)).toBe(singular)
  })

  it.each([
    ['pirões', 'pirão'],
    ['cães', 'cão'],
    ['irmãos', 'irmão'],
    ['homens', 'homem'],
    ['luzes', 'luz'],
    ['mulheres', 'mulher'],
  ])('handles the Portuguese plural %s', (plural, singular) => {
    expect(stem(plural)).toBe(singular)
  })

  // The failure this product cannot tolerate. A general-purpose Portuguese
  // stemmer folds `comer` to `com`, turning a common verb into a preposition
  // and promoting a stop word into the top terms. Verb conjugation is the
  // dictionary's job; this never attempts it.
  it.each(['comer', 'falar', 'partir', 'casar', 'pôr'])(
    'leaves the infinitive %s completely alone',
    (verb) => {
      expect(stem(verb)).toBe(verb)
    },
  )

  it('never produces a stop word', () => {
    for (const word of ['comer', 'casas', 'nadas', 'todos', 'eles']) {
      const stemmed = stem(word)
      if (stemmed !== word) expect(STOP_WORDS.has(stemmed)).toBe(false)
    }
  })

  it('leaves short words alone', () => {
    expect(stem('as')).toBe('as')
    expect(stem('nós')).toBe('nós')
    expect(stem('gás')).toBe('gás')
  })

  it.each(['lápis', 'ônibus', 'vírus', 'atlas'])(
    'knows %s is not a plural',
    (invariant) => {
      expect(stem(invariant)).toBe(invariant)
    },
  )

  it('is idempotent, so re-running analysis cannot shrink a word twice', () => {
    for (const word of ['hotdogs', 'pirões', 'homens', 'casas', 'comer']) {
      expect(stem(stem(word))).toBe(stem(word))
    }
  })

  it('does not strip accents', () => {
    expect(stem('gravações')).toBe('gravação')
    expect(stem('pôde')).toBe('pôde')
  })
})
