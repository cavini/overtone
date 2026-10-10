// US-011 · a search result lands on the line that was said at that moment
import { describe, expect, it } from 'vitest'
import { lineAtMoment } from './line-at-moment.js'

const at = (...starts: readonly number[]) => starts.map((startMs) => ({ startMs }))

describe('lineAtMoment', () => {
  it('finds the line that was being said', () => {
    expect(lineAtMoment(at(0, 5_000, 10_000), 7_000)).toBe(1)
  })

  it('lands on the line that starts exactly then', () => {
    expect(lineAtMoment(at(0, 5_000, 10_000), 5_000)).toBe(1)
  })

  it('stays on the last line for a moment after all of them', () => {
    expect(lineAtMoment(at(0, 5_000), 99_000)).toBe(1)
  })

  // A hit inside the first line, whose own start is a few hundred
  // milliseconds in. Rounding it down to "no line" would leave the reader
  // at the top with nothing marked.
  it('uses the first line for a moment before it starts', () => {
    expect(lineAtMoment(at(400, 5_000), 0)).toBe(0)
  })

  it('has no line to point at when nothing is transcribed yet', () => {
    expect(lineAtMoment([], 1_000)).toBeUndefined()
  })
})
