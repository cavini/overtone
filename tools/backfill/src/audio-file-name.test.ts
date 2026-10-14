// The name is the metadata.
//
// `/api/episodes/start` takes a filename, not a title: the server reads the
// programme and the episode number out of it (`readEpisodeName`), files the
// episode under that programme, and looks the real title up in the feed by
// that number. So the name this builds is not cosmetic — get it wrong and
// the episode lands under no programme, numbered after whatever was
// uploaded last.
//
// Asserted against the server's own parser rather than against a string I
// typed, because that parser is the thing that has to agree.
import { readEpisodeName } from '@overtone/core'
import { describe, expect, it } from 'vitest'
import { audioFileName } from './audio-file-name.js'

describe('audioFileName', () => {
  it('is the show in kebab case with the number on the end', () => {
    expect(audioFileName('Chuva de Canivetes', 1)).toBe('chuva-de-canivetes-001.mp3')
  })

  it('pads to three digits, so a listing sorts the way it reads', () => {
    expect(audioFileName('Chuva de Canivetes', 42)).toBe('chuva-de-canivetes-042.mp3')
    expect(audioFileName('Chuva de Canivetes', 201)).toBe('chuva-de-canivetes-201.mp3')
  })

  // Padding is a minimum, not a width. A four-digit number truncated to
  // three would be a different episode.
  it('does not lose a digit from a long-running show', () => {
    expect(audioFileName('Chuva de Canivetes', 1001)).toBe('chuva-de-canivetes-1001.mp3')
  })

  /*
   * The one character that must never survive.
   *
   * `readEpisodeName` reads the number from the last word of the name and
   * only if the whole word is digits, so `chuva-de-canivetes-#001` has no
   * number in it at all — the episode would be filed under no programme and
   * numbered one past whatever was uploaded last. Feed titles are written
   * `Chuva de Canivetes #001`, so the `#` is right there in the source string.
   */
  it('keeps the hash out of the name', () => {
    expect(audioFileName('Chuva de Canivetes #', 1)).toBe('chuva-de-canivetes-001.mp3')
  })

  it('runs punctuation and spaces together into single hyphens', () => {
    expect(audioFileName('  Chuva   de,  Canivetes!  ', 7)).toBe('chuva-de-canivetes-007.mp3')
  })

  /*
   * Accents stay. They are not stripped anywhere in this project — and the
   * name is what the title falls back to when the feed cannot be reached,
   * so a stripped one would put a misspelling in the library.
   */
  it('leaves the letters of the language alone', () => {
    expect(audioFileName('Sessão da Tarde', 9)).toBe('sessão-da-tarde-009.mp3')
  })

  describe('read back by the server that will receive it', () => {
    it.each([
      ['Chuva de Canivetes', 1],
      ['Chuva de Canivetes', 201],
      ['Outro Programa', 42],
    ] as const)('gives back the number of %s %i', (show, number) => {
      expect(readEpisodeName(audioFileName(show, number)).number).toBe(number)
    })

    /*
     * What is left once the number comes off is the programme the episode is
     * filed under, and the same string is what scopes the feed lookup — a
     * feed carrying several shows numbers each of them from one.
     */
    it.each(['Chuva de Canivetes', 'Outro Programa'] as const)(
      'gives back %s as the programme',
      (show) => {
        expect(readEpisodeName(audioFileName(show, 3)).title).toBe(show)
      },
    )
  })
})
