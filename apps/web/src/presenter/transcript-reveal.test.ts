// US-010
import { describe, expect, it } from 'vitest'
import {
  REVEAL_CATCH_UP_MS,
  REVEAL_TICK_MS,
  revealAfterTick,
  totalChars,
  visibleLines,
} from './transcript-reveal.js'

/** A twelve-minute chunk is roughly two thousand words. */
const CHUNK_CHARS = 12_000

/** A two-hour episode is roughly twenty thousand. */
const EPISODE_CHARS = 110_000

describe('revealAfterTick', () => {
  it('stops at the end of what has been transcribed', () => {
    expect(revealAfterTick(10, 10)).toBe(10)
    expect(revealAfterTick(9, 10)).toBe(10)
  })

  // Text cannot un-transcribe itself, but a reveal that ran past the end
  // would slice beyond the string and show nothing at all.
  it('never runs past the end', () => {
    expect(revealAfterTick(12, 10)).toBe(10)
  })

  // The slowest it ever goes, and the reason it is a reveal rather than a
  // paste: the last words of a chunk arrive at reading speed.
  it('reads at a typing pace when it is nearly caught up', () => {
    expect(revealAfterTick(0, 100)).toBe(3)
    expect(revealAfterTick(0, 4)).toBe(2)
  })

  // A stall would be worse than no animation: the reader would sit in front
  // of text that exists and is not being shown to them.
  it('always moves while there is anything left', () => {
    for (const shown of [0, 1, 7, 999]) {
      expect(revealAfterTick(shown, shown + 1)).toBeGreaterThan(shown)
    }
  })

  /*
   * The one property that matters.
   *
   * A chunk lands every few minutes and a whole episode's backlog lands the
   * moment someone reopens the panel. An effect that typed those out at a
   * fixed pace would be minutes behind what is already transcribed — showing
   * someone a stale transcript while claiming to show them a live one. So
   * the pace is read off the backlog: the bigger it is, the faster it goes.
   */
  it.each([
    ['a chunk', CHUNK_CHARS],
    ['a whole episode', EPISODE_CHARS],
  ])('catches up on %s inside the window', (_what, chars) => {
    let shown = 0
    let ticks = 0

    while (shown < chars) {
      shown = revealAfterTick(shown, chars)
      ticks += 1
    }

    expect(ticks * REVEAL_TICK_MS).toBeLessThanOrEqual(REVEAL_CATCH_UP_MS)
  })
})

describe('totalChars', () => {
  it('counts the characters of every part', () => {
    expect(totalChars([{ index: 0, text: 'abc' }, { index: 1, text: 'de' }])).toBe(5)
  })

  it('is nothing when there is nothing', () => {
    expect(totalChars([])).toBe(0)
  })
})

describe('visibleLines', () => {
  const parts = [
    { index: 0, text: 'bom dia' },
    { index: 1, text: 'feijão' },
  ]

  it('shows nothing before anything is revealed', () => {
    expect(visibleLines(parts, 0)).toEqual([])
  })

  it('cuts the part being read where the reveal has got to', () => {
    expect(visibleLines(parts, 3)).toEqual([{ index: 0, text: 'bom' }])
  })

  it('shows everything once the reveal has caught up', () => {
    expect(visibleLines(parts, 13)).toEqual(parts)
  })

  it('holds back the part the reveal has not reached', () => {
    expect(visibleLines(parts, 9)).toEqual([
      { index: 0, text: 'bom dia' },
      { index: 1, text: 'fe' },
    ])
  })

  /*
   * A settled part comes back as the very object it was given.
   *
   * Not a detail: the reveal advances twenty times a second, and a new
   * object each time would have React rebuild every paragraph of a
   * twenty-thousand-word transcript on every tick. Only the paragraph being
   * typed should change.
   */
  it('hands back the parts already read untouched', () => {
    const [first] = visibleLines(parts, 9)

    expect(first).toBe(parts[0])
  })

  // Silence, or a stretch of music. An empty paragraph is a gap in the page
  // that nothing explains.
  it('leaves out a chunk that came back silent', () => {
    expect(visibleLines([{ index: 0, text: '' }, { index: 1, text: 'depois' }], 4)).toEqual([
      { index: 1, text: 'depo' },
    ])
  })
})
