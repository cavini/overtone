// US-050
import { describe, expect, it } from 'vitest'
import { readArguments } from './read-arguments.js'

describe('readArguments', () => {
  it('reads a show and a count', () => {
    expect(readArguments(['Chuva de Canivetes', '3'])).toEqual({
      show: 'Chuva de Canivetes',
      howMany: 3,
    })
  })

  /*
   * The footgun this exists for. `pnpm backfill 10` is the obvious thing to
   * type when the show is already in the environment — and it used to be
   * read as a *show named "10"*, which matches nothing in the feed and
   * reports "0 to do now" as though the catalogue were finished.
   */
  it('reads a lone number as the count, not as a show called 10', () => {
    expect(readArguments(['10'])).toEqual({ howMany: 10 })
  })

  it('leaves the show to the environment when none is named', () => {
    expect(readArguments([])).toEqual({})
    expect(readArguments([''])).toEqual({})
    expect(readArguments(['', '5'])).toEqual({ howMany: 5 })
  })

  // A show whose name really is digits would be indistinguishable, and the
  // explicit form is the way to say it.
  it('still takes a numeric show when it is given explicitly', () => {
    expect(readArguments(['2018', '4'])).toEqual({ show: '2018', howMany: 4 })
  })

  it('trims what came off a shell', () => {
    expect(readArguments(['  Chuva de Canivetes  ', ' 7 '])).toEqual({
      show: 'Chuva de Canivetes',
      howMany: 7,
    })
  })

  it.each(['nope', '0', '-1', '2.5', ''])('refuses %o as a count', (bad) => {
    expect(() => readArguments(['Chuva de Canivetes', bad])).toThrow(/episodes/u)
  })
})
