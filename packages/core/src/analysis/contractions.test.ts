import { describe, expect, it } from 'vitest'
import { splitContractions } from './contractions.js'

describe('splitContractions', () => {
  /*
   * The English answer to `diga-me`.
   *
   * A contraction is two words written as one, and leaving them joined costs
   * the same thing enclitics would cost in Portuguese: `it's`, `that's` and
   * `there's` arrive as three separate terms rather than as `it`, `that`,
   * `there` and a copula the default view hides. On a frequency list for
   * casual speech they would crowd out everything real.
   */
  it.each([
    ["it's", ['it', 's']],
    ["i'm", ['i', 'm']],
    ["they're", ['they', 're']],
    ["we'll", ['we', 'll']],
    ["i'd", ['i', 'd']],
    ["they've", ['they', 've']],
  ])('peels the clitic off %s', (word, expected) => {
    expect(splitContractions(word)).toEqual(expected)
  })

  // The point of splitting rather than stop-wording the whole form: the head
  // is a word somebody is counting.
  it('leaves the head countable', () => {
    expect(splitContractions("podcast's")).toEqual(['podcast', 's'])
    expect(splitContractions("dekão's")).toEqual(['dekão', 's'])
  })

  // Whisper writes a typographic apostrophe about as often as a typewriter
  // one. Handling only one spelling would leave half the contractions joined.
  it('accepts either spelling of the apostrophe', () => {
    expect(splitContractions('it’s')).toEqual(['it', 's'])
  })

  /*
   * `n't` stays attached.
   *
   * `can't` and `won't` do not contract from `can` and `will`, so peeling
   * the suffix leaves `ca` and `wo` — a made-up word at the top of a
   * frequency list. Every contracted negative is an auxiliary plus a
   * negation, so the whole form is a stop word instead and nothing is lost.
   */
  it.each(["don't", "can't", "won't", "isn't", "wouldn't"])('leaves %s whole', (word) => {
    expect(splitContractions(word)).toEqual([word])
  })

  // An apostrophe is not a clitic marker on its own.
  it.each(["o'clock", "y'all", "rock'n'roll", 'façam', 'podcast'])(
    'leaves %s alone',
    (word) => {
      expect(splitContractions(word)).toEqual([word])
    },
  )

  // Diacritics survive, as they must everywhere in this pipeline.
  it('never touches a letter', () => {
    expect(splitContractions("café's").join('')).toContain('café')
  })

  it('never produces an empty head', () => {
    for (const word of ["'s", "'ve", "'", '']) {
      expect(splitContractions(word)).toEqual([word])
    }
  })
})
