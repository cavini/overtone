// US-004, US-015 · domain decisions D1, D5
import { describe, expect, it } from 'vitest'
import { countTerms } from './count-terms.js'
import { normalize } from './normalize.js'
import { tokenise } from './tokenise.js'

const analyse = (text: string, options?: Parameters<typeof countTerms>[1]) =>
  countTerms(tokenise(normalize(text)), options)

const SENTENCE = 'O pirão do churrasco é melhor que o pirão da feira'

describe('countTerms', () => {
  it('counts every occurrence, including repeats in one sentence', () => {
    const { terms } = analyse(SENTENCE)
    expect(terms.find((t) => t.term === 'pirão')?.count).toBe(2)
  })

  it('leaves stop words and fillers out of the default view', () => {
    const { terms } = analyse(`${SENTENCE} eh`)
    const listed = terms.map((t) => t.term)
    expect(listed).not.toContain('o')
    expect(listed).not.toContain('é')
    expect(listed).not.toContain('eh')
    expect(listed).toEqual(['pirão', 'churrasco', 'feira', 'melhor'])
  })

  it('includes them on request', () => {
    const { terms } = analyse(SENTENCE, { include: 'all' })
    expect(terms.map((t) => t.term)).toContain('o')
    expect(terms.find((t) => t.term === 'o')?.count).toBe(2)
  })

  it('sorts by count, then alphabetically, so the order never wobbles', () => {
    const { terms } = analyse(SENTENCE)
    expect(terms.map((t) => [t.term, t.count])).toEqual([
      ['pirão', 2],
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

  it('keeps every surface form that contributed to a term', () => {
    const { terms } = analyse('Pirão pirão PIRÃO')
    expect(terms[0]?.surfaceForms).toEqual(['pirão'])
    expect(terms[0]?.count).toBe(3)
  })

  it('handles an empty stream', () => {
    const counts = countTerms([])
    expect(counts.terms).toEqual([])
    expect(counts.totalTokens).toBe(0)
    expect(counts.uniqueTerms).toBe(0)
  })

  it('never merges words that differ only by an accent', () => {
    const { terms } = analyse('Ele pode falar. Ele pôde falar.', { include: 'all' })
    const listed = terms.map((t) => t.term)
    expect(listed).toContain('pode')
    expect(listed).toContain('pôde')
  })

  // The contract the whole product rests on.
  it('is deterministic', () => {
    const once = analyse(SENTENCE)
    const twice = analyse(SENTENCE)
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once))
  })
})
