// US-002 · the invitation is what protects the allowance
import { describe, expect, it } from 'vitest'
import { isInvited } from './invited.js'

const GROUP = 'dex@example.test, loen@example.test'

describe('isInvited', () => {
  it('lets a listed address in', () => {
    expect(isInvited('dex@example.test', GROUP)).toBe(true)
    expect(isInvited('loen@example.test', GROUP)).toBe(true)
  })

  /*
   * The whole point. Uploading spends from one shared budget of three
   * episodes a day, so a sign-in anybody can complete is that budget open
   * to the internet.
   */
  it('keeps everybody else out', () => {
    expect(isInvited('stranger@example.test', GROUP)).toBe(false)
  })

  it('does not care about capitals or stray spaces', () => {
    expect(isInvited('  DEX@Example.test ', GROUP)).toBe(true)
  })

  // A fresh checkout runs with no setup, the same bargain the shared
  // password made.
  it.each([undefined, '', '   ', ' , '])('lets anyone in when the list is %o', (list) => {
    expect(isInvited('anyone@example.test', list)).toBe(true)
  })

  it('is not fooled by an address that merely contains a listed one', () => {
    expect(isInvited('dex@example.test.evil.test', GROUP)).toBe(false)
    expect(isInvited('notdex@example.test', GROUP)).toBe(false)
  })

  it('reads a list written without spaces', () => {
    expect(isInvited('loen@example.test', 'dex@example.test,loen@example.test')).toBe(true)
  })
})
