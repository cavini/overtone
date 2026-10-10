// US-010 · one rule for where a line of the transcript breaks
import { describe, expect, it } from 'vitest'
import type { TimedWord } from '../domain/timed-word.js'
import { groupWords } from './group-words.js'

const spoken = (...texts: string[]): TimedWord[] =>
  texts.map((text, i) => ({ text, startMs: i * 400, endMs: i * 400 + 400 }))

const textOf = (
  words: readonly TimedWord[],
  maxWords?: number,
  boundariesMs?: readonly number[],
) =>
  groupWords(words, maxWords, boundariesMs).map((group) =>
    group.words.map((w) => w.text).join(' '),
  )

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

  /*
   * The transcriber's own boundaries, which are the only thing that knows a
   * different person started talking.
   *
   * Reported: three turns on one line, because the transcriber wrote no full
   * stop between them — "o táxi passava na lombada Sai a cabeça da criança".
   * Punctuation alone cannot break that; the transcriber's segments do, and
   * they were being thrown away.
   */
  it('breaks where the transcriber started a new segment', () => {
    const words = spoken('vai', 'tomar', 'no', 'cu', 'então', 'acho', 'que', 'sim')
    expect(textOf(words, undefined, [0, 1_600])).toEqual(['vai tomar no cu', 'então acho que sim'])
  })

  it('still breaks on a full stop between two segment boundaries', () => {
    expect(textOf(spoken('olá', 'galera.', 'hoje', 'não.'), undefined, [0])).toEqual([
      'olá galera.',
      'hoje não.',
    ])
  })

  /*
   * The transcriber's segment starts and its word starts come from
   * different passes and disagree by tens to hundreds of milliseconds, so a
   * boundary is attached to the nearest word start rather than matched
   * exactly. Here the boundary at 420 ms belongs to the word that starts at
   * 400, not the one at 0.
   */
  it('attaches a boundary to the word whose start is nearest it', () => {
    const words = spoken('um', 'dois', 'tres', 'quatro')
    expect(textOf(words, undefined, [0, 420])).toEqual(['um', 'dois tres quatro'])
  })

  it('ignores a boundary that is not between two words', () => {
    expect(textOf(spoken('um', 'dois'), undefined, [0, 99_000])).toEqual(['um dois'])
  })

  /*
   * Measured on real audio: the transcriber puts a boundary before a
   * trailing `né?`, which is part of the sentence before it and not a new
   * turn. Breaking there turns one spoken line into two and reads worse
   * than the problem this is fixing.
   */
  it('does not strand a tag question on its own line', () => {
    const words = spoken('ela', 'agora', 'é', 'membro', 'da', 'Itália,', 'né?')
    expect(textOf(words, undefined, [0, 2_400])).toEqual(['ela agora é membro da Itália, né?'])
  })

  // But a short line that follows a finished sentence is a real turn, and
  // those are exactly what was running together.
  it('keeps a short line that follows a full stop', () => {
    const words = spoken('eu', 'vou', 'ajudar.', 'vai', 'tomar', 'no', 'cu.')
    expect(textOf(words, undefined, [0, 1_200])).toEqual(['eu vou ajudar.', 'vai tomar no cu.'])
  })

  it('keeps a long line that a boundary split out of a run with no full stop', () => {
    const words = spoken('o', 'táxi', 'passava', 'na', 'lombada', 'sai', 'a', 'cabeça', 'da', 'criança')
    expect(textOf(words, undefined, [0, 2_000])).toEqual([
      'o táxi passava na lombada',
      'sai a cabeça da criança',
    ])
  })

  it('groups on punctuation alone when there are no boundaries', () => {
    expect(textOf(spoken('um.', 'dois.'), undefined, [])).toEqual(['um.', 'dois.'])
  })

  it('has nothing to group when there are no words', () => {
    expect(groupWords([])).toEqual([])
  })
})
