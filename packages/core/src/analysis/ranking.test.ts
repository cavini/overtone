import { describe, expect, it } from 'vitest'
import { compareByCountThenLabel } from './ranking.js'

const rank = (items: Array<{ count: number; label: string }>) =>
  [...items].sort(compareByCountThenLabel).map((item) => item.label)

describe('compareByCountThenLabel', () => {
  it('puts the bigger count first', () => {
    expect(rank([
      { count: 1, label: 'a' },
      { count: 9, label: 'b' },
    ])).toEqual(['b', 'a'])
  })

  it('breaks a tie alphabetically', () => {
    expect(rank([
      { count: 2, label: 'zebra' },
      { count: 2, label: 'abacaxi' },
    ])).toEqual(['abacaxi', 'zebra'])
  })

  it('treats identical entries as equal', () => {
    expect(compareByCountThenLabel(
      { count: 3, label: 'feijão' },
      { count: 3, label: 'feijão' },
    )).toBe(0)
  })

  // Ordering by code unit rather than locale collation is deliberate. A
  // collator's output depends on the ICU version in the runtime, so two
  // machines could rank the same two terms differently — and a count that
  // moves between machines is not reproducible.
  it('does not depend on the runtime locale', () => {
    expect(rank([
      { count: 1, label: 'ação' },
      { count: 1, label: 'abacaxi' },
    ])).toEqual(['abacaxi', 'ação'])
  })
})
