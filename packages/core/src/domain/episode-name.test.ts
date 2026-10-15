// US-049
import { describe, expect, it } from 'vitest'
import { readEpisodeName, titleFor } from './episode-name.js'

describe('readEpisodeName', () => {
  /*
   * Files arrive named the way a filesystem likes them, and that is what
   * was being stored: a library listing `chuva-de-canivetes-201` eleven
   * times reads like a directory, not like a show.
   */
  it('reads a hyphenated filename as a title and a number', () => {
    expect(readEpisodeName('chuva-de-canivetes-201.m4a')).toEqual({
      title: 'Chuva de Canivetes',
      number: 201,
      numberAsWritten: '201',
    })
  })

  it.each(['chuva_de_canivetes_199.mp3', 'chuva de canivetes 199.wav', 'Chuva-de-Canivetes-199.M4A'])(
    'reads %o the same way',
    (filename) => {
      expect(readEpisodeName(filename)).toEqual({
        title: 'Chuva de Canivetes',
        number: 199,
        numberAsWritten: '199',
      })
    },
  )

  it('keeps a name that has no number', () => {
    expect(readEpisodeName('entrevista especial.mp3')).toEqual({ title: 'Entrevista Especial' })
  })

  // Only a trailing number is the episode. A date at the front is part of
  // the name, and treating it as the number would file every episode of a
  // month under 2026.
  it('does not mistake a leading number for the episode', () => {
    expect(readEpisodeName('2026-01-15-interview.mp3')).toEqual({
      title: '2026 01 15 Interview',
    })
  })

  it('drops a leading zero', () => {
    expect(readEpisodeName('ep-07.m4a')).toMatchObject({ number: 7 })
  })

  // Small words stay small, the way a title is actually written — except
  // when they start it.
  it.each([
    ['o-pior-dos-mundos.mp3', 'O Pior dos Mundos'],
    ['the-end-of-the-world.mp3', 'The End of the World'],
    ['de-volta-para-o-futuro.mp3', 'De Volta para o Futuro'],
  ])('writes %o as a title: %o', (filename, title) => {
    expect(readEpisodeName(filename).title).toBe(title)
  })

  it('leaves a word that is already capitalised alone', () => {
    expect(readEpisodeName('entrevista com NASA.mp3').title).toBe('Entrevista com NASA')
  })

  it('copes with a file that is only a number', () => {
    expect(readEpisodeName('201.mp3')).toEqual({
      title: '',
      number: 201,
      numberAsWritten: '201',
    })
  })

  it.each(['', '.mp3', '   .wav'])('has nothing to say about %o', (filename) => {
    expect(readEpisodeName(filename)).toEqual({ title: '' })
  })

  it('collapses the punctuation a filename collects', () => {
    expect(readEpisodeName('chuva--de__canivetes  201 .m4a')).toEqual({
      title: 'Chuva de Canivetes',
      number: 201,
      numberAsWritten: '201',
    })
  })

  // A number too large to be an episode is part of the name — a bitrate, a
  // date stamp, a phone number someone put in a filename.
  it('does not read an implausible number as an episode', () => {
    expect(readEpisodeName('mixdown-320000.mp3').number).toBeUndefined()
  })
})

/*
 * What a library shows when the feed cannot be reached.
 *
 * The real failure: the show's private feed URL began answering 401, so the
 * publisher's title was unavailable and the fallback was the name with the
 * number *stripped off* — every episode reading "Chuva de Canivetes", one
 * indistinguishable from the next, while the number sat in the row beside it
 * the whole time.
 */
describe('titleFor', () => {
  it('keeps the number, written the way the filename wrote it', () => {
    expect(titleFor('chuva-de-canivetes-016.mp3')).toBe('Chuva de Canivetes #016')
  })

  /*
   * Not re-padded to some fixed width. The feed writes `#016` and the
   * filename came from the feed, so reusing the digits exactly is what keeps
   * a fallback title next to a real one without one of them looking wrong.
   */
  it.each([
    ['chuva-de-canivetes-7.mp3', 'Chuva de Canivetes #7'],
    ['chuva-de-canivetes-07.mp3', 'Chuva de Canivetes #07'],
    ['chuva-de-canivetes-0007.mp3', 'Chuva de Canivetes #0007'],
  ])('%s -> %s', (filename, expected) => {
    expect(titleFor(filename)).toBe(expected)
  })

  it('leaves a name with no number alone', () => {
    expect(titleFor('carequinha-dourado.mp3')).toBe('Carequinha Dourado')
  })

  // Nothing readable in the name at all, so the filename is the honest answer
  // — it is at least what the person uploaded.
  it('falls back to the filename when there is no name to read', () => {
    expect(titleFor('-.mp3')).toBe('-.mp3')
  })
})

