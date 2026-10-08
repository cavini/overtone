// US-019, US-020 · domain decisions D6, D8
import { describe, expect, it } from 'vitest'
import type { Topic } from '../domain/topic.js'
import { annotate } from './annotate.js'
import { findMentions } from './find-mentions.js'
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
  findMentions(annotate(tokenise(normalize(text)), LEMMAS), topic)

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
