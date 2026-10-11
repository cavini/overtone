// US-032 · signing in
//
// The door on the screen must be the door that is actually open. PR #28 left
// the app showing the magic-link form while the only working way in was the
// shared password, and the mismatch was invisible for as long as the
// builder's own cookie lasted.
import { describe, expect, it } from 'vitest'
import { whichDoor } from './which-door.js'

describe('whichDoor', () => {
  it('asks for the password when there is one', () => {
    expect(whichDoor('correct horse')).toBe('password')
  })

  it('offers a link when there is no password', () => {
    expect(whichDoor(undefined)).toBe('link')
  })

  /*
   * The same reading as `/api/enter`, which treats an empty password as not
   * configured. Were these to disagree, the page would offer a password
   * field that the endpoint refuses every time — a door painted on a wall.
   */
  it.each(['', '   ', '\n'])('treats %o as no password at all', (blank) => {
    expect(whichDoor(blank)).toBe('link')
  })
})
