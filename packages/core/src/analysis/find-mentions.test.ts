// US-019, US-020 · domain decisions D6, D8
import { describe, expect, it } from 'vitest'
import type { Topic } from '../domain/topic.js'
import { annotate } from './annotate.js'
import { findMentions, matchKeyFor } from './find-mentions.js'
import { normalize } from './normalize.js'
import { tokenise } from './tokenise.js'

const GUARDACHUVA: Topic = {
  id: 'topic-1',
  name: 'Guardachuva',
  patterns: ['guardachuva', 'chapéu de chuva'],
}

const LEMMAS: ReadonlyMap<string, string> = new Map([
  ['guardachuvas', 'guardachuva'],
  ['chapéus', 'chapéu'],
])

const mentionsIn = (text: string, topic: Topic = GUARDACHUVA) =>
  findMentions(annotate(tokenise(normalize(text), 'pt'), LEMMAS, 'pt'), topic)

describe('findMentions', () => {
  it('finds a single-word topic', () => {
    expect(mentionsIn('eu amo guardachuva')).toHaveLength(1)
  })

  // The stakeholder's own example. People think in concepts, not spelling.
  it.each(['guardachuva', 'guarda chuva', 'guarda-chuva'])('matches the spelling %s', (spelling) => {
    expect(mentionsIn(`comi um ${spelling} ontem`)).toHaveLength(1)
  })

  it('finds all three spellings in one breath', () => {
    expect(mentionsIn('guardachuva, guarda chuva, guarda-chuva')).toHaveLength(3)
  })

  it('matches a plural through its lemma', () => {
    const [mention] = mentionsIn('adoro guardachuvas')
    expect(mention?.matchedText).toBe('guardachuvas')
  })

  it('matches a multi-word pattern', () => {
    expect(mentionsIn('comi chapéu de chuva ontem')).toHaveLength(1)
  })

  it('counts each occurrence, not each sentence', () => {
    expect(mentionsIn('guardachuva e mais guardachuva')).toHaveLength(2)
  })

  // Transcribed punctuation is unreliable enough that respecting sentence
  // boundaries would cause more false negatives than the false positives it
  // prevents. This one is an accepted, documented false positive.
  it('matches across a sentence boundary', () => {
    expect(mentionsIn('comprei o guarda. Chuva molhou tudo')).toHaveLength(1)
  })

  it('does not match with anything in between', () => {
    expect(mentionsIn('guarda sol chuva')).toHaveLength(0)
    expect(mentionsIn('chapéu de muita chuva')).toHaveLength(0)
  })

  it('reports where in the stream the match sits', () => {
    const [mention] = mentionsIn('eu amo guarda chuva demais')
    expect(mention).toMatchObject({
      topicId: 'topic-1',
      matchedText: 'guarda chuva',
      startIndex: 2,
      endIndex: 3,
    })
  })

  it('prefers the longest pattern and never counts a token twice', () => {
    const topic: Topic = {
      id: 'topic-2',
      name: 'Chapéu',
      patterns: ['chapéu', 'chapéu de chuva'],
    }
    const mentions = mentionsIn('comi chapéu de chuva', topic)
    expect(mentions).toHaveLength(1)
    expect(mentions[0]?.matchedText).toBe('chapéu de chuva')
  })

  it('ignores a leading article in the pattern', () => {
    const topic: Topic = { id: 'topic-3', name: 'Guardachuva', patterns: ['o guardachuva'] }
    expect(mentionsIn('comi guardachuva', topic)).toHaveLength(1)
  })

  it('ignores a pattern with no letters in it', () => {
    const topic: Topic = { id: 'x', name: 'Junk', patterns: ['...', '---'] }
    expect(mentionsIn('guardachuva ... ---', topic)).toEqual([])
  })

  it('keeps a pattern that is nothing but determiners', () => {
    const topic: Topic = { id: 'y', name: 'Artigo', patterns: ['o a'] }
    expect(mentionsIn('o a', topic)).toHaveLength(1)
  })

  it('finds nothing for a topic with no patterns', () => {
    expect(mentionsIn('guardachuva', { id: 'x', name: 'Empty', patterns: [] })).toEqual([])
  })

  it('finds nothing in an empty stream', () => {
    expect(findMentions([], GUARDACHUVA)).toEqual([])
  })

  it('is case- and accent-insensitive in the way normalisation already is', () => {
    expect(mentionsIn('CHAPÉU DE CHUVA')).toHaveLength(1)
  })

  it('does not match a word that merely contains the pattern', () => {
    expect(mentionsIn('guardachuvinha')).toHaveLength(0)
  })

  it('is deterministic', () => {
    const once = mentionsIn('guardachuva, guarda chuva, chapéu de chuva')
    expect(JSON.stringify(mentionsIn('guardachuva, guarda chuva, chapéu de chuva'))).toBe(
      JSON.stringify(once),
    )
  })
})

// US-046 · ADR 0006
describe('matchKeyFor', () => {
  /*
   * Saving a joke and scanning for it are two different places in two
   * different packages, and they have to arrive at the same string. They did
   * not: storage stripped spaces and hyphens off the raw text, so "o feijão"
   * was filed under `ofeijão` while the scanner looked for `feijão` — and the
   * joke counted zero with nothing to show it had failed.
   */
  it('agrees with what the scanner actually looks for', () => {
    for (const pattern of ['feijão', 'o feijão', 'O Feijão', '  feijão  ']) {
      const topic: Topic = { id: 't', name: 'Feijão', patterns: [pattern] }
      const found = mentionsIn('nós falamos do feijão ontem', topic)

      expect(found.length, pattern).toBe(1)
      expect(matchKeyFor(pattern), pattern).toBe(matchKeyFor('feijão'))
    }
  })

  it('collapses the ways a compound gets written', () => {
    expect(matchKeyFor('guarda chuva')).toBe(matchKeyFor('guardachuva'))
    expect(matchKeyFor('guarda-chuva')).toBe(matchKeyFor('guardachuva'))
  })

  // Accents are never stripped: `e` and `é` are different words, and so are
  // `por` and `pôr`.
  it('keeps accents apart', () => {
    expect(matchKeyFor('feijão')).not.toBe(matchKeyFor('feijao'))
  })

  it('has nothing to look up for a pattern with no words in it', () => {
    for (const empty of ['', '   ', '...', '-']) {
      expect(matchKeyFor(empty), empty).toBeUndefined()
    }
  })
})
