// US-040 · the boundaries the browser reports
//
// Every number here becomes a timestamp somebody reads, and it arrives from
// a browser, so none of it is trusted.
import { describe, expect, it } from 'vitest'
import { planChunks } from '@overtone/core'
import { isPlausible } from './boundaries.js'

const HOUR = 60 * 60_000
const planned = planChunks(HOUR).map((chunk) => chunk.startMs)

describe('isPlausible', () => {
  it('accepts the plan itself', () => {
    expect(isPlausible(planned, HOUR)).toBe(true)
  })

  it('accepts seams nudged off the plan', () => {
    const moved = planned.map((start, at) => (at === 0 ? 0 : start + 3_141))

    expect(isPlausible(moved, HOUR)).toBe(true)
  })

  it.each([
    ['one chunk too many', [...planned, HOUR - 1]],
    ['one too few', planned.slice(0, -1)],
    ['nothing at all', []],
    ['not starting at the beginning', planned.map((start, at) => (at === 0 ? 500 : start))],
    ['out of order', [...planned].reverse()],
    ['a repeat', planned.map((start, at) => (at === 2 ? (planned[1] ?? 0) : start))],
    ['past the end of the audio', planned.map((start, at) => (at === 1 ? HOUR + 1 : start))],
    ['a fraction of a millisecond', planned.map((start, at) => (at === 1 ? start + 0.5 : start))],
    ['a negative', planned.map((start, at) => (at === 1 ? -1 : start))],
  ])('refuses %s', (_what, startsMs) => {
    expect(isPlausible(startsMs, HOUR)).toBe(false)
  })

  // A short episode is one chunk, and its only boundary is the beginning.
  it('accepts the single chunk of a short episode', () => {
    expect(isPlausible([0], 600_000)).toBe(true)
    expect(isPlausible([0, 300_000], 600_000)).toBe(false)
  })
})
