// US-004, US-015 · domain decisions D2, D5
import { describe, expect, it } from 'vitest'
import { classify } from './classify.js'
import { FILLERS, STOP_WORDS } from './vocabulary.js'

describe('classify', () => {
  it.each(['o', 'a', 'de', 'que', 'não', 'para', 'com', 'uma', 'do', 'na', 'pelo'])(
    'calls %s a stop word',
    (word) => {
      expect(classify(word, 'pt')).toBe('stopword')
    },
  )

  it.each(['pirão', 'hotdog', 'churrasco', 'gravação', 'episódio'])(
    'calls %s a word',
    (word) => {
      expect(classify(word, 'pt')).toBe('word')
    },
  )

  it.each(['eh', 'ah', 'hum', 'hmm', 'ahn', 'uh'])('calls %s a filler', (sound) => {
    expect(classify(sound, 'pt')).toBe('filler')
  })

  // `é` is the verb "to be", not a hesitation noise. Folding it into the
  // filler class would delete one of the most common words in the language
  // from every count.
  it('calls é a stop word, never a filler', () => {
    expect(classify('é', 'pt')).toBe('stopword')
    expect(FILLERS.has('é')).toBe(false)
  })

  // These are the counts a podcast actually finds funny, so they stay
  // countable rather than being filtered away as noise.
  it.each(['né', 'tipo', 'cara', 'sabe', 'mano'])('keeps %s countable', (marker) => {
    expect(classify(marker, 'pt')).toBe('word')
  })

  it('classifies the enclitics the tokeniser splits off as stop words', () => {
    for (const clitic of ['me', 'te', 'se', 'lhe', 'lo', 'la', 'nos', 'vos']) {
      expect(classify(clitic, 'pt')).toBe('stopword')
    }
  })

  it('is case- and accent-sensitive, so it expects normalised input', () => {
    expect(classify('O', 'pt')).toBe('word')
    expect(classify('esta', 'pt')).toBe('stopword')
  })
})

describe('vocabulary', () => {
  it('has no overlap between stop words and fillers', () => {
    const both = [...STOP_WORDS].filter((w) => FILLERS.has(w))
    expect(both).toEqual([])
  })

  it('is big enough to be useful and small enough to be deliberate', () => {
    expect(STOP_WORDS.size).toBeGreaterThan(150)
    expect(STOP_WORDS.size).toBeLessThan(400)
  })

  it('holds only normalised entries', () => {
    for (const entry of [...STOP_WORDS, ...FILLERS]) {
      expect(entry).toBe(entry.toLowerCase().normalize('NFC'))
      expect(entry.trim()).toBe(entry)
    }
  })
})

describe('classify, in English', () => {
  it.each(['the', 'of', 'and', 'is', 'that', "don't"])('calls %s a stop word', (word) => {
    expect(classify(word, 'en')).toBe('stopword')
  })

  it.each(['uh', 'um', 'erm', 'mhm'])('calls %s a filler', (sound) => {
    expect(classify(sound, 'en')).toBe('filler')
  })

  it.each(['podcast', 'hotdog', 'like', 'friend'])('calls %s a word', (word) => {
    expect(classify(word, 'en')).toBe('word')
  })

  /*
   * The reason there are two lists rather than one.
   *
   * `que` is grammatical scaffolding in Portuguese and nothing at all in
   * English; `the` is the reverse. A single merged list would hide a word in
   * the language where it carries meaning, and the hiding would be invisible
   * — the token is still stored and still counted, it just never appears.
   */
  it('reads the same spelling differently in each language', () => {
    expect(classify('que', 'pt')).toBe('stopword')
    expect(classify('que', 'en')).toBe('word')
    expect(classify('the', 'en')).toBe('stopword')
    expect(classify('the', 'pt')).toBe('word')
  })

  // `era` is a stop word in Portuguese — the imperfect of "to be" — and a
  // countable noun in English. Exactly the overlap that makes one list wrong.
  it('does not suppress an English noun that is a Portuguese stop word', () => {
    expect(classify('era', 'pt')).toBe('stopword')
    expect(classify('era', 'en')).toBe('word')
  })
})
