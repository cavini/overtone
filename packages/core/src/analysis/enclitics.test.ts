// US-004 · counting words with full provenance
//
// An enclitic that stays attached is a word that never gets counted, and a
// compound that gets split is a word counted twice. This module had no test
// of its own — it was only ever exercised through the tokeniser.
import { describe, expect, it } from 'vitest'
import { splitEnclitics } from './enclitics.js'

describe('splitEnclitics', () => {
  it.each([
    ['diga-me', ['diga', 'me']],
    ['fazê-lo', ['fazê', 'lo']],
    ['dá-se', ['dá', 'se']],
    ['foda-se', ['foda', 'se']],
    ['deu-lhe', ['deu', 'lhe']],
    ['vamo-nos', ['vamo', 'nos']],
  ])('peels the pronoun off %o', (word, want) => {
    expect(splitEnclitics(word)).toEqual(want)
  })

  /*
   * Only the final segment is ever tested, which is what lets compounds
   * through without a dictionary: `guarda-chuva` ends in `chuva`, and even
   * `bem-te-vi` — whose middle segment *is* a clitic — ends in `vi`.
   */
  it.each(['guarda-chuva', 'segunda-feira', 'bem-te-vi', 'cor-de-rosa', 'mão-de-obra'])(
    'leaves the compound %o whole',
    (word) => {
      expect(splitEnclitics(word)).toEqual([word])
    },
  )

  // `o a os as` are deliberately not clitics here: as the second half of a
  // compound they are indistinguishable without a dictionary, and shredding
  // compounds costs more than missing a pronoun nobody counts.
  it.each(['dá-o', 'viu-a', 'faz-os', 'tem-as'])('leaves %o alone, on purpose', (word) => {
    expect(splitEnclitics(word)).toEqual([word])
  })

  it('peels more than one, innermost last', () => {
    expect(splitEnclitics('diz-se-me')).toEqual(['diz', 'se', 'me'])
  })

  it.each([
    ['semhífen', ['semhífen']],
    ['', ['']],
    // Leading hyphen: `lastIndexOf` is 0, so there is no head to peel from
    // and the word is handed back as it came. `normalize` would have
    // trimmed it before this anyway.
    ['-me', ['-me']],
  ])('handles %o without losing the word', (word, want) => {
    expect(splitEnclitics(word)).toEqual(want)
  })

  /*
   * A word that is only punctuation yields nothing countable. It used to
   * come back as `['-']` and now comes back as `['']`, which changes
   * nothing: `surfacesOf` drops any part with no letter or digit in it, so
   * neither was ever counted. The contract worth pinning is that one, not
   * the shape of the intermediate value.
   */
  it.each(['-', '--', '—'])('yields nothing countable for %o', (word) => {
    expect(splitEnclitics(word).filter((part) => /[\p{L}\p{N}]/u.test(part))).toEqual([])
  })

  /*
   * `normalize` trims punctuation at a token's edges, so a lone `diga-`
   * never reaches here. A doubled inner hyphen does, because its edges are
   * letters — and `diga-` as a head is a second bucket for a word that
   * already has one.
   *
   * No instance of this in the episode we have; it is kept because the
   * tokeniser's stated position is that it tolerates stray punctuation
   * instead of trusting its caller.
   */
  it('does not leave a dangling hyphen on the verb', () => {
    expect(splitEnclitics('diga--me')).toEqual(['diga', 'me'])
  })

  it('does not hand back a head that is punctuation', () => {
    expect(splitEnclitics('diga-')).toEqual(['diga'])
  })
})
