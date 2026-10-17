// US-014 · filho and filha are similar, not the same
import { describe, expect, it } from 'vitest'
import { mergesGenderPt } from './gender-merge.js'

describe('mergesGenderPt', () => {
  it.each([
    ['menina', 'menino'],
    ['nova', 'novo'],
    ['burra', 'burro'],
    ['última', 'último'],
    ['música', 'músico'],
    ['política', 'político'],
    ['irmã', 'irmão'],
    ['professora', 'professor'],
  ])('catches %s being folded into %s', (surface, lemma) => {
    expect(mergesGenderPt(surface, lemma)).toBe(true)
  })

  /*
   * The other direction, which the rule treats the same and nothing tested.
   *
   * The bundled list maps feminine onto masculine, so that is the case this
   * was written for — but a list that mapped the other way is suppressed for
   * exactly the same reason: a son is not a daughter whichever of the two the
   * dictionary decided to call the citation form. Worth pinning, because a
   * rule that is symmetric by accident becomes asymmetric by accident too.
   */
  it.each([
    ['menino', 'menina'],
    ['novo', 'nova'],
    ['músico', 'música'],
    ['irmão', 'irmã'],
  ])('catches %s being folded into %s as well', (surface, lemma) => {
    expect(mergesGenderPt(surface, lemma)).toBe(true)
  })

  /*
   * A vowel swap it must *not* claim. These pairs look like the rule's shape
   * and are unrelated words, so the answer depends on the dictionary having
   * grouped them — which it has not, and this is what that looks like
   * arriving here.
   */
  it.each([
    ['ano', 'anel'],
    ['copo', 'cópia'],
    ['mesa', 'mês'],
  ])('leaves %s and %s apart, which no swap connects', (surface, lemma) => {
    expect(mergesGenderPt(surface, lemma)).toBe(false)
  })

  /*
   * The guarantee this rests on: a Portuguese infinitive always ends in -r.
   * So a lemma that does not cannot be a verb, and these can never be caught
   * by the rule however much they look like a vowel swap.
   */
  it.each([
    ['fala', 'falar'],
    ['passa', 'passar'],
    ['olha', 'olhar'],
    ['deixa', 'deixar'],
    ['quebra', 'quebrar'],
    ['sabe', 'saber'],
    ['fui', 'ir'],
    ['acho', 'achar'],
  ])('leaves %s alone, which belongs with %s', (surface, lemma) => {
    expect(mergesGenderPt(surface, lemma)).toBe(false)
  })

  /*
   * The trap in the professor/professora pattern. "Drop the final a" is the
   * obvious way to write it, and the pluperfect is exactly that shape:
   * `falara` minus its `a` is `falar`. Matching only `-ora` is what keeps
   * these apart.
   */
  it.each([
    ['falara', 'falar'],
    ['comera', 'comer'],
    ['partira', 'partir'],
  ])('leaves the pluperfect %s with its verb %s', (surface, lemma) => {
    expect(mergesGenderPt(surface, lemma)).toBe(false)
  })

  it('has nothing to suppress when the lemma is the word itself', () => {
    expect(mergesGenderPt('deus', 'deus')).toBe(false)
  })

  // A plural is a number, not a gender, and collapsing it is wanted.
  it('leaves a plural folding into its singular alone', () => {
    expect(mergesGenderPt('meninos', 'menino')).toBe(false)
  })

  it('is not fooled by a word with no gender ending at all', () => {
    expect(mergesGenderPt('dois', 'dois')).toBe(false)
    expect(mergesGenderPt('feliz', 'feliz')).toBe(false)
  })
})
