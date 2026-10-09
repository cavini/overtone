// US-042 · ADR 0017
import { LOCALES } from '@overtone/messages'
import { describe, expect, it } from 'vitest'
import { UI } from './ui.js'

describe('the interface chrome', () => {
  it('exists in every language the app offers', () => {
    expect(Object.keys(UI).sort()).toEqual([...LOCALES].sort())
  })

  // A label present in one language and missing in the other renders as a
  // key on the page. It has happened to every bilingual product once.
  it('has the same labels in both', () => {
    const [first, ...rest] = Object.values(UI).map((labels) => Object.keys(labels).sort())

    for (const other of rest) expect(other).toEqual(first)
  })

  it('has no empty labels', () => {
    for (const labels of Object.values(UI)) {
      for (const [key, value] of Object.entries(labels)) {
        expect(value.trim(), key).not.toBe('')
      }
    }
  })

  // Chrome takes no parameters. Anything with a placeholder is a sentence the
  // domain should be emitting as a typed code instead (ADR 0017).
  it('takes no parameters', () => {
    for (const labels of Object.values(UI)) {
      for (const [key, value] of Object.entries(labels)) {
        expect(value, key).not.toMatch(/\{/u)
      }
    }
  })

  // Two languages that say the same thing have not been translated.
  it('differs between languages where it should', () => {
    const differing = Object.keys(UI.en).filter(
      (key) => UI.en[key as keyof typeof UI.en] !== UI.pt[key as keyof typeof UI.pt],
    )

    // `appName` is a proper noun and stays put; everything else is prose.
    expect(Object.keys(UI.en).length - differing.length).toBe(1)
  })
})
