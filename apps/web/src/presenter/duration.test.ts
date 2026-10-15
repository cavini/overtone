// US-041 · the wait says how long it is
import { describe, expect, it } from 'vitest'
import { splitDuration } from './duration.js'

describe('splitDuration', () => {
  /*
   * The reason this exists. The countdown was minutes and seconds with no
   * hour rollover, so a wait for the daily allowance to refill read as
   * "868:23" — a number nobody can turn into a time without dividing it by
   * sixty in their head.
   */
  it('rolls minutes over into hours', () => {
    expect(splitDuration(868 * 60_000 + 23_000)).toEqual({
      hours: 14,
      minutes: 28,
      seconds: 23,
    })
  })

  it('reads an ordinary short wait', () => {
    expect(splitDuration(3 * 3_600_000 + 20 * 60_000 + 10_000)).toEqual({
      hours: 3,
      minutes: 20,
      seconds: 10,
    })
  })

  it('leaves out an hour there is none of', () => {
    expect(splitDuration(90_000)).toEqual({ minutes: 1, seconds: 30 })
  })

  it('leaves out minutes there are none of', () => {
    expect(splitDuration(42_000)).toEqual({ seconds: 42 })
  })

  /*
   * A whole number of hours says so, rather than "3h 0min 0s". The parts
   * that are zero are absent, so the component has nothing to render for
   * them and no rule of its own about when to.
   */
  it('says a round number plainly', () => {
    expect(splitDuration(2 * 3_600_000)).toEqual({ hours: 2 })
    expect(splitDuration(5 * 60_000)).toEqual({ minutes: 5 })
  })

  // Rounded up, because a countdown that reaches zero while the wait is
  // still on reads as broken.
  it('rounds a part-second up', () => {
    expect(splitDuration(1)).toEqual({ seconds: 1 })
    expect(splitDuration(59_400)).toEqual({ minutes: 1 })
  })

  /*
   * Nothing left to wait for. Zero rather than an empty object, so the
   * component always has something to show — an empty one would render as a
   * label with a blank after it.
   */
  it('says zero seconds when the wait is over', () => {
    expect(splitDuration(0)).toEqual({ seconds: 0 })
    expect(splitDuration(-5_000)).toEqual({ seconds: 0 })
  })
})
