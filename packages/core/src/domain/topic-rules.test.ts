// US-046 · ADR 0006
import { describe, expect, it } from 'vitest'
import {
  MAX_TERMS_PER_TOPIC,
  MAX_TOPICS_PER_SERIES,
  MAX_WORDS_PER_TERM,
  checkTopic,
} from './topic-rules.js'

const draft = (name: string, patterns: readonly string[]) => ({ name, patterns })

describe('checkTopic', () => {
  it('accepts a joke with a name and a word', () => {
    expect(checkTopic(draft('Feijão', ['feijão']), [])).toBeUndefined()
  })

  // A topic with no terms matches nothing and silently reports zero, which
  // looks like "we never said it" rather than "you never told us what to
  // look for".
  it.each([[[]], [['']], [['   ']]])('refuses a joke with nothing to count: %o', (patterns) => {
    expect(checkTopic(draft('Feijão', patterns), [])).toEqual({ code: 'TOPIC_NEEDS_A_TERM' })
  })

  it('refuses a joke with no name', () => {
    expect(checkTopic(draft('  ', ['feijão']), [])).toEqual({ code: 'TOPIC_NEEDS_A_NAME' })
  })

  it('refuses a name already taken', () => {
    const problem = checkTopic(draft('Feijão', ['feijão']), [draft('Feijão', ['x'])])

    expect(problem).toEqual({ code: 'TOPIC_NAME_TAKEN', name: 'Feijão' })
  })

  // Names are for people, so "feijão" and "Feijão" are the same joke.
  it('compares names the way a person would', () => {
    expect(checkTopic(draft('  feijão ', ['x']), [draft('Feijão', ['y'])])).toMatchObject({
      code: 'TOPIC_NAME_TAKEN',
    })
  })

  it('allows a different name', () => {
    expect(checkTopic(draft('Guardachuva', ['guardachuva']), [draft('Feijão', ['feijão'])])).toBeUndefined()
  })

  it('refuses more variations than it will hold', () => {
    const tooMany = Array.from({ length: MAX_TERMS_PER_TOPIC + 1 }, (_, i) => `t${i}`)

    expect(checkTopic(draft('Bit', tooMany), [])).toEqual({
      code: 'TOPIC_TERM_LIMIT',
      maxTerms: MAX_TERMS_PER_TOPIC,
    })
  })

  it('allows exactly the limit', () => {
    const exactly = Array.from({ length: MAX_TERMS_PER_TOPIC }, (_, i) => `t${i}`)

    expect(checkTopic(draft('Bit', exactly), [])).toBeUndefined()
  })

  // A phrase that long is a sentence, not a running joke, and matching it
  // would mostly fail on the transcriber's word boundaries anyway.
  it('refuses a phrase longer than a joke ever is', () => {
    const sentence = Array.from({ length: MAX_WORDS_PER_TERM + 1 }, () => 'palavra').join(' ')

    expect(checkTopic(draft('Bit', [sentence]), [])).toEqual({
      code: 'TERM_TOO_MANY_WORDS',
      wordCount: MAX_WORDS_PER_TERM + 1,
      maxWords: MAX_WORDS_PER_TERM,
    })
  })

  it('allows a phrase of exactly the limit', () => {
    const phrase = Array.from({ length: MAX_WORDS_PER_TERM }, () => 'palavra').join(' ')

    expect(checkTopic(draft('Bit', [phrase]), [])).toBeUndefined()
  })

  it('refuses one joke too many for the series', () => {
    const full = Array.from({ length: MAX_TOPICS_PER_SERIES }, (_, i) => draft(`J${i}`, ['x']))

    expect(checkTopic(draft('More', ['y']), full)).toEqual({
      code: 'LIBRARY_TOPIC_LIMIT',
      maxTopics: MAX_TOPICS_PER_SERIES,
    })
  })

  // Reported before the others, because being full is a different kind of
  // answer from getting one field wrong — nothing they change about this
  // joke will help.
  it('reports a full library before quibbling with the joke', () => {
    const full = Array.from({ length: MAX_TOPICS_PER_SERIES }, (_, i) => draft(`J${i}`, ['x']))

    expect(checkTopic(draft('', []), full)).toMatchObject({ code: 'LIBRARY_TOPIC_LIMIT' })
  })

  it('does not count the joke being edited against the limit', () => {
    const full = Array.from({ length: MAX_TOPICS_PER_SERIES }, (_, i) => draft(`J${i}`, ['x']))

    expect(checkTopic(draft('J0', ['x', 'y']), full, 'J0')).toBeUndefined()
  })
})

describe('the limits themselves', () => {
  // Enough spellings for the transcriber's variants. Experiment 0001 found
  // "guardachuva" consistently heard as "Guadachuva": a joke needs room for
  // the way it is said *and* the ways it comes out.
  it('leaves room for mishearings', () => {
    expect(MAX_TERMS_PER_TOPIC).toBeGreaterThanOrEqual(5)
  })

  it('bounds the per-episode work', () => {
    // Every topic is scanned across every token of a two-hour episode.
    expect(MAX_TOPICS_PER_SERIES).toBeLessThanOrEqual(50)
  })
})
