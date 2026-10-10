// US-010 · one rule for where a line of the transcript breaks
import { describe, expect, it } from 'vitest'
import type { TimedWord } from '../domain/timed-word.js'
import { groupWords } from './group-words.js'

const spoken = (...texts: string[]): TimedWord[] =>
  texts.map((text, i) => ({ text, startMs: i * 400, endMs: i * 400 + 400 }))

const textOf = (words: readonly TimedWord[], maxWords?: number) =>
  groupWords(words, maxWords).map((group) => group.words.map((w) => w.text).join(' '))

describe('groupWords', () => {
  it('breaks at the end of a sentence', () => {
    expect(textOf(spoken('Olá', 'galera.', 'Hoje', 'falamos', 'disso.'))).toEqual([
      'Olá galera.',
      'Hoje falamos disso.',
    ])
  })

  it.each(['.', '!', '?', '…'])('breaks after %s', (mark) => {
    expect(textOf(spoken(`pronto${mark}`, 'depois'))).toHaveLength(2)
  })

  it('does not break on bare punctuation, which is a pause and not a sentence', () => {
    expect(textOf(spoken('...', 'então', 'foi.'))).toEqual(['... então foi.'])
  })

  it('breaks at the word cap when punctuation never arrives', () => {
    const groups = textOf(spoken(...Array.from({ length: 9 }, (_, i) => `w${i}`)), 4)
    expect(groups.map((g) => g.split(' ').length)).toEqual([4, 4, 1])
  })

  it('spans each group from its first word to its last', () => {
    const [first] = groupWords(spoken('um', 'dois.'))
    expect(first).toMatchObject({ startMs: 0, endMs: 800 })
  })

  it('keeps every word, so nothing said is dropped from the page', () => {
    const words = spoken('um.', 'dois', 'três.', 'quatro')
    expect(groupWords(words).flatMap((g) => g.words)).toEqual(words)
  })

  it('has nothing to group when there are no words', () => {
    expect(groupWords([])).toEqual([])
  })
})
