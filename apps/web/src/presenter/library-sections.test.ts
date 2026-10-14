// US-051 · the library reads in sections, one per programme
import { describe, expect, it } from 'vitest'
import { groupedByCategory, type LibrarySection } from './library-sections.js'

const episode = (title: string, category?: string | null) => ({
  title,
  ...(category === undefined ? {} : { category }),
})

/** Generic, or the return type erases the row down to what it was grouped on. */
const shapeOf = <Episode extends { readonly title: string }>(
  sections: ReadonlyArray<LibrarySection<Episode>>,
) => sections.map((section) => [section.category, section.episodes.map((e) => e.title)])

describe('groupedByCategory', () => {
  it('puts each programme in its own section', () => {
    const sections = groupedByCategory([
      episode('Chuva de Canivetes #002', 'Chuva de Canivetes'),
      episode('Outro Programa #001', 'Outro Programa'),
      episode('Chuva de Canivetes #001', 'Chuva de Canivetes'),
    ])

    expect(shapeOf(sections)).toEqual([
      ['Chuva de Canivetes', ['Chuva de Canivetes #002', 'Chuva de Canivetes #001']],
      ['Outro Programa', ['Outro Programa #001']],
    ])
  })

  /*
   * The order the caller handed them over, which is already the order the
   * library sorts by. Re-sorting here would mean two places deciding what
   * "first" means, and they would disagree the moment one changed.
   */
  it('keeps the episodes in the order they arrived', () => {
    const sections = groupedByCategory([
      episode('third', 'A'),
      episode('first', 'A'),
      episode('second', 'A'),
    ])

    expect(sections[0]?.episodes.map((e) => e.title)).toEqual(['third', 'first', 'second'])
  })

  /*
   * Biggest first, so the show somebody actually came to read is at the top
   * rather than wherever the alphabet put it. Alphabetical only to break a
   * tie, because a list that reorders itself on every upload is worse than
   * one that is occasionally in the wrong order.
   */
  it('leads with the programme that has the most episodes', () => {
    /*
     * Named so size and the alphabet disagree. With `Alpha` as the larger
     * one this passed against a plain alphabetical sort too, and said
     * nothing at all.
     */
    const sections = groupedByCategory([
      episode('a1', 'Alpha'),
      episode('z1', 'Zeta'),
      episode('z2', 'Zeta'),
    ])

    expect(sections.map((s) => s.category)).toEqual(['Zeta', 'Alpha'])
  })

  it('breaks a tie on the name', () => {
    const sections = groupedByCategory([episode('z', 'Zeta'), episode('a', 'Alpha')])

    expect(sections.map((s) => s.category)).toEqual(['Alpha', 'Zeta'])
  })

  /*
   * Last, however many there are. An episode with no programme is one whose
   * filename carried no number — a loose upload, not a show — and it should
   * not head the library just because there are several of them.
   */
  it('puts the uncategorised at the end', () => {
    const sections = groupedByCategory([
      episode('loose one'),
      episode('loose two', null),
      episode('a show', 'Alpha'),
    ])

    expect(shapeOf(sections)).toEqual([
      ['Alpha', ['a show']],
      [undefined, ['loose one', 'loose two']],
    ])
  })

  it('has nothing to show for an empty library', () => {
    expect(groupedByCategory([])).toEqual([])
  })

  // One section, so the page can tell "every episode is one show" from
  // "this library has programmes in it" and not draw headings for nothing.
  it('is a single section when everything is one programme', () => {
    expect(groupedByCategory([episode('a', 'Alpha'), episode('b', 'Alpha')])).toHaveLength(1)
  })
})
