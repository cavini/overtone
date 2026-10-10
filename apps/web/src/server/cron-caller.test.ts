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
   * Open when no secret is configured, the same way the password gate is.
   * A fresh checkout runs with no setup, and the endpoint reads one row and
   * returns nothing — there is nothing here to protect but the noise.
   */
  it('lets anyone through when no secret is configured', () => {
    expect(isTheScheduler(null, undefined)).toBe(true)
    expect(isTheScheduler(null, '')).toBe(true)
  })

  // A timing-safe comparison would be better, but the two strings differ in
  // length far more often than not, and this is a liveness ping.
  it('does not match a secret that is merely a prefix', () => {
    expect(isTheScheduler('Bearer s3', 's3cret')).toBe(false)
  })
})
