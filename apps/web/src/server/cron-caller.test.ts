// US-041 · the project must survive a week nobody uploads
import { describe, expect, it } from 'vitest'
import { isTheScheduler } from './cron-caller.js'

describe('isTheScheduler', () => {
  it('recognises the secret the scheduler was given', () => {
    expect(isTheScheduler('Bearer s3cret', 's3cret')).toBe(true)
  })

  it('turns away a caller with the wrong secret', () => {
    expect(isTheScheduler('Bearer guess', 's3cret')).toBe(false)
  })

  it('turns away a caller with no authorisation at all', () => {
    expect(isTheScheduler(null, 's3cret')).toBe(false)
  })

  it('turns away a bare secret without the scheme the scheduler sends', () => {
    expect(isTheScheduler('s3cret', 's3cret')).toBe(false)
  })

  /*
   * Closed when no secret is configured, which reverses what this used to do.
   *
   * The old reasoning was the password gate's: a fresh checkout runs with no
   * setup, and "the endpoint reads one row and returns nothing — there is
   * nothing here to protect but the noise". That is true of `keep-alive` and
   * false of the other endpoint behind this same guard:
   * `advance-pending` reaches for the oldest unfinished episode belonging to
   * *any* user and spends a transcription allowance shared by everyone.
   *
   * So a missing variable now fails loudly instead of opening a door. A fresh
   * checkout loses nothing by it — there is no episode to advance and nobody
   * pinging it.
   */
  it('turns everyone away when no secret is configured', () => {
    expect(isTheScheduler(null, undefined)).toBe(false)
    expect(isTheScheduler(null, '')).toBe(false)
    // Not even a caller who guessed that the secret is unset.
    expect(isTheScheduler('Bearer ', undefined)).toBe(false)
  })

  it('does not match a secret that is merely a prefix', () => {
    expect(isTheScheduler('Bearer s3', 's3cret')).toBe(false)
  })

  /*
   * Compared in constant time. The previous note said a timing-safe
   * comparison "would be better, but ... this is a liveness ping" — the same
   * conflation as above, since the allowance-spending endpoint sits behind
   * the same function. A byte-by-byte `===` leaks where the first difference
   * is, and this is a secret rather than a password nobody chose.
   */
  it('still answers correctly for secrets of the same length', () => {
    expect(isTheScheduler('Bearer aaaaaa', 'aaaaaa')).toBe(true)
    expect(isTheScheduler('Bearer aaaaab', 'aaaaaa')).toBe(false)
  })

  // A longer or shorter token must be refused rather than throw, which is
  // what `timingSafeEqual` does when handed buffers of different lengths.
  it('refuses a token of the wrong length without throwing', () => {
    expect(isTheScheduler('Bearer much-much-longer-than-the-secret', 's3cret')).toBe(false)
    expect(isTheScheduler('Bearer s', 's3cret')).toBe(false)
  })
})
