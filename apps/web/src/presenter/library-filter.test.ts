// US-038
import { describe, expect, it } from 'vitest'
import { episodesMatching } from './library-filter.js'

const EPISODES = [
  { title: 'Cúpula do Guardachuva' },
  { title: 'A volta do feijão' },
  { title: 'Guardachuva, parte dois' },
] as const

const titlesOf = (episodes: readonly { readonly title: string }[]): string[] =>
  episodes.map((episode) => episode.title)

describe('narrowing the library by what was typed', () => {
  it('keeps every episode while nothing has been typed', () => {
    expect(episodesMatching(EPISODES, '')).toEqual(EPISODES)
  })

  // A box someone has tabbed through and left a space in is an empty box.
  it('keeps every episode when only blanks have been typed', () => {
    expect(episodesMatching(EPISODES, '   ')).toEqual(EPISODES)
  })

  it('keeps the titles the words appear in, in the order they were listed', () => {
    expect(titlesOf(episodesMatching(EPISODES, 'guardachuva'))).toEqual([
      'Cúpula do Guardachuva',
      'Guardachuva, parte dois',
    ])
  })

  it('matches part of a word, so the list narrows while you type', () => {
    expect(titlesOf(episodesMatching(EPISODES, 'fei'))).toEqual(['A volta do feijão'])
  })

  it('ignores case, and blanks either side of what was typed', () => {
    expect(titlesOf(episodesMatching(EPISODES, '  CÚPULA '))).toEqual(['Cúpula do Guardachuva'])
  })

  /*
   * The same accent, written two ways.
   *
   * A title comes from the filename, and macOS hands filenames over
   * decomposed: `a` followed by a combining tilde, two characters. Typed
   * into a browser that same accent arrives composed, as one character.
   * They look identical and compare unequal, so without normalising, a
   * filter would fail to find the very episode it is showing.
   */
  it('finds a title whose accents were written as separate characters', () => {
    const decomposed = [{ title: 'A volta do feija\u0303o' }]

    expect(episodesMatching(decomposed, 'feij\u00e3o')).toEqual(decomposed)
  })

  /*
   * Accents are never stripped. `por`/`pôr` and `esta`/`está` are different
   * words here, and a filter that folded them would be the one place in the
   * app that disagreed.
   */
  it('still treats an accent as a letter of its own', () => {
    expect(episodesMatching(EPISODES, 'feijao')).toEqual([])
  })

  it('finds nothing when nothing matches', () => {
    expect(episodesMatching(EPISODES, 'churrasco')).toEqual([])
  })
})
