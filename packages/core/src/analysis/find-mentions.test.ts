// US-019, US-020 · domain decisions D6, D8
import { describe, expect, it } from 'vitest'
import type { Topic } from '../domain/topic.js'
import { annotate } from './annotate.js'
import { findMentions, matchKeyFor } from './find-mentions.js'
import { normalize } from './normalize.js'
import { tokenise } from './tokenise.js'

const HOTDOG: Topic = {
  id: 'topic-1',
  name: 'Hotdog',
  patterns: ['hotdog', 'pão com salsicha'],
}

const LEMMAS: ReadonlyMap<string, string> = new Map([
  ['hotdogs', 'hotdog'],
  ['salsichas', 'salsicha'],
])

const mentionsIn = (text: string, topic: Topic = HOTDOG) =>
  findMentions(annotate(tokenise(normalize(text), 'pt'), LEMMAS, 'pt'), topic)

describe('findMentions', () => {
  it('finds a single-word topic', () => {
    expect(mentionsIn('eu amo hotdog')).toHaveLength(1)
  })

  // The stakeholder's own example. People think in concepts, not spelling.
  it.each(['hotdog', 'hot dog', 'hot-dog'])('matches the spelling %s', (spelling) => {
    expect(mentionsIn(`comi um ${spelling} ontem`)).toHaveLength(1)
  })

  it('finds all three spellings in one breath', () => {
    expect(mentionsIn('hotdog, hot dog, hot-dog')).toHaveLength(3)
  })

  it('matches a plural through its lemma', () => {
    const [mention] = mentionsIn('adoro hotdogs')
    expect(mention?.matchedText).toBe('hotdogs')
  })

  it('matches a multi-word pattern', () => {
    expect(mentionsIn('comi pão com salsicha ontem')).toHaveLength(1)
  })

  it('counts each occurrence, not each sentence', () => {
    expect(mentionsIn('hotdog e mais hotdog')).toHaveLength(2)
  })

  // Transcribed punctuation is unreliable enough that respecting sentence
  // boundaries would cause more false negatives than the false positives it
  // prevents. This one is an accepted, documented false positive.
  it('matches across a sentence boundary', () => {
    expect(mentionsIn('comprei o hot. Dog comeu tudo')).toHaveLength(1)
  })

  it('does not match with anything in between', () => {
    expect(mentionsIn('hot cachorro dog')).toHaveLength(0)
    expect(mentionsIn('pão com muita salsicha')).toHaveLength(0)
  })

  it('reports where in the stream the match sits', () => {
    const [mention] = mentionsIn('eu amo hot dog demais')
    expect(mention).toMatchObject({
      topicId: 'topic-1',
      matchedText: 'hot dog',
      startIndex: 2,
      endIndex: 3,
    })
  })

  it('prefers the longest pattern and never counts a token twice', () => {
    const topic: Topic = {
      id: 'topic-2',
      name: 'Pão',
      patterns: ['pão', 'pão com salsicha'],
    }
    const mentions = mentionsIn('comi pão com salsicha', topic)
    expect(mentions).toHaveLength(1)
    expect(mentions[0]?.matchedText).toBe('pão com salsicha')
  })

  it('ignores a leading article in the pattern', () => {
    const topic: Topic = { id: 'topic-3', name: 'Hotdog', patterns: ['o hotdog'] }
    expect(mentionsIn('comi hotdog', topic)).toHaveLength(1)
  })

  it('ignores a pattern with no letters in it', () => {
    const topic: Topic = { id: 'x', name: 'Junk', patterns: ['...', '---'] }
    expect(mentionsIn('hotdog ... ---', topic)).toEqual([])
  })

  it('keeps a pattern that is nothing but determiners', () => {
    const topic: Topic = { id: 'y', name: 'Artigo', patterns: ['o a'] }
    expect(mentionsIn('o a', topic)).toHaveLength(1)
  })

  it('finds nothing for a topic with no patterns', () => {
    expect(mentionsIn('hotdog', { id: 'x', name: 'Empty', patterns: [] })).toEqual([])
  })

  it('finds nothing in an empty stream', () => {
    expect(findMentions([], HOTDOG)).toEqual([])
  })

  it('is case- and accent-insensitive in the way normalisation already is', () => {
    expect(mentionsIn('PÃO COM SALSICHA')).toHaveLength(1)
  })

  it('does not match a word that merely contains the pattern', () => {
    expect(mentionsIn('hotdoguinho')).toHaveLength(0)
  })

  it('is deterministic', () => {
    const once = mentionsIn('hotdog, hot dog, pão com salsicha')
    expect(JSON.stringify(mentionsIn('hotdog, hot dog, pão com salsicha'))).toBe(
      JSON.stringify(once),
    )
  })
})

// US-046 · ADR 0006
describe('matchKeyFor', () => {
  /*
   * Saving a joke and scanning for it are two different places in two
   * different packages, and they have to arrive at the same string. They did
   * not: storage stripped spaces and hyphens off the raw text, so "o pirão"
   * was filed under `opirão` while the scanner looked for `pirão` — and the
   * joke counted zero with nothing to show it had failed.
   */
  it('agrees with what the scanner actually looks for', () => {
    for (const pattern of ['pirão', 'o pirão', 'O Pirão', '  pirão  ']) {
      const topic: Topic = { id: 't', name: 'Pirão', patterns: [pattern] }
      const found = mentionsIn('nós falamos do pirão ontem', topic)

      expect(found.length, pattern).toBe(1)
      expect(matchKeyFor(pattern), pattern).toBe(matchKeyFor('pirão'))
    }
  })

  it('collapses the ways a compound gets written', () => {
    expect(matchKeyFor('hot dog')).toBe(matchKeyFor('hotdog'))
    expect(matchKeyFor('hot-dog')).toBe(matchKeyFor('hotdog'))
  })

  // Accents are never stripped: `e` and `é` are different words, and so are
  // `por` and `pôr`.
  it('keeps accents apart', () => {
    expect(matchKeyFor('pirão')).not.toBe(matchKeyFor('pirao'))
  })

  it('has nothing to look up for a pattern with no words in it', () => {
    for (const empty of ['', '   ', '...', '-']) {
      expect(matchKeyFor(empty), empty).toBeUndefined()
    }
  })
})
