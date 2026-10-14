// US-004, US-015, US-016 · domain decisions D1, D4, D5
import { describe, expect, it } from 'vitest'
import { annotate } from './annotate.js'
import { countTerms, type CountTermsOptions } from './count-terms.js'
import { normalize } from './normalize.js'
import { tokenise } from './tokenise.js'

const NO_DICTIONARY: ReadonlyMap<string, string> = new Map()

const VERBS: ReadonlyMap<string, string> = new Map([
  ['falei', 'falar'],
  ['falando', 'falar'],
  ['falar', 'falar'],
  ['falou', 'falar'],
])

const analyse = (
  text: string,
  options?: CountTermsOptions,
  lemmas: ReadonlyMap<string, string> = NO_DICTIONARY,
) => countTerms(annotate(tokenise(normalize(text), 'pt'), lemmas, 'pt'), options)

const SENTENCE = 'O feijão do churrasco é melhor que o feijão da feira'

describe('countTerms', () => {
  it('counts every occurrence, including repeats in one sentence', () => {
    expect(analyse(SENTENCE).terms.find((t) => t.term === 'feijão')?.count).toBe(2)
  })

  it('leaves stop words and fillers out of the default view', () => {
    const listed = analyse(`${SENTENCE} eh`).terms.map((t) => t.term)
    expect(listed).not.toContain('o')
    expect(listed).not.toContain('é')
    expect(listed).not.toContain('eh')
    expect(listed).toEqual(['feijão', 'churrasco', 'feira', 'melhor'])
  })

  it('includes them on request', () => {
    const { terms } = analyse(SENTENCE, { include: 'all' })
    expect(terms.find((t) => t.term === 'o')?.count).toBe(2)
  })

  it('sorts by count, then alphabetically, so the order never wobbles', () => {
    expect(analyse(SENTENCE).terms.map((t) => [t.term, t.count])).toEqual([
      ['feijão', 2],
      ['churrasco', 1],
      ['feira', 1],
      ['melhor', 1],
    ])
  })

  // Catches a whole family of double-counting and dropped-token bugs with one
  // assertion: every token lands in exactly one bucket.
  it('conserves tokens across the three classes', () => {
    const counts = analyse(`${SENTENCE} eh ah tipo`)
    expect(counts.wordTokens + counts.stopWordTokens + counts.fillerTokens).toBe(
      counts.totalTokens,
    )
    expect(counts.totalTokens).toBe(14)
    expect(counts.stopWordTokens).toBe(6)
    expect(counts.fillerTokens).toBe(2)
    expect(counts.wordTokens).toBe(6)
  })

  it('reports how many distinct terms were counted', () => {
    expect(analyse(SENTENCE).uniqueTerms).toBe(4)
    expect(analyse(SENTENCE, { include: 'all' }).uniqueTerms).toBe(9)
  })

  describe('grouping inflections', () => {
    it('counts every form of a verb as one term', () => {
      const { terms } = analyse('Falei, estou falando, vou falar e ele falou', {}, VERBS)
      expect(terms[0]?.term).toBe('falar')
      expect(terms[0]?.count).toBe(4)
    })

    // What makes a grouped count explicable: the user sees exactly which
    // spellings were folded together, and can tell us if we got it wrong.
    it('lists the surface forms that produced the term', () => {
      const { terms } = analyse('Falei, estou falando, vou falar', {}, VERBS)
      expect(terms[0]?.surfaceForms).toEqual(['falando', 'falar', 'falei'])
    })

    it('marks a grouping the stemmer made, so the UI can flag it', () => {
      const { terms } = analyse('guardachuvas e guardachuva')
      expect(terms[0]).toMatchObject({ term: 'guardachuva', count: 2, heuristic: true })
    })

    it('does not mark a grouping the dictionary made', () => {
      const { terms } = analyse('Falei e falando', {}, VERBS)
      expect(terms[0]?.heuristic).toBe(false)
    })

    it('does not mark a term that was never grouped at all', () => {
      expect(analyse('feijão').terms[0]?.heuristic).toBe(false)
    })
  })

  it('handles an empty stream', () => {
    const counts = countTerms([])
    expect(counts.terms).toEqual([])
    expect(counts.totalTokens).toBe(0)
    expect(counts.uniqueTerms).toBe(0)
  })

  it('never merges words that differ only by an accent', () => {
    const listed = analyse('Ele pode falar. Ele pôde falar.', { include: 'all' }).terms
      .map((t) => t.term)
    expect(listed).toContain('pode')
    expect(listed).toContain('pôde')
  })

  // The contract the whole product rests on.
  it('is deterministic', () => {
    const once = analyse(SENTENCE, {}, VERBS)
    expect(JSON.stringify(analyse(SENTENCE, {}, VERBS))).toBe(JSON.stringify(once))
  })
})
