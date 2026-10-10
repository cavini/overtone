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

  /*
   * Two languages that say the same thing have not been translated.
   *
   * Named rather than counted. A count tells you *that* something is
   * untranslated and leaves you to work out what; a list says which labels
   * are deliberately identical and makes anything else a failure with an
   * obvious cause.
   */
  const DELIBERATELY_IDENTICAL = new Set([
    // A proper noun.
    'appName',
    // Example words shown in placeholders. They are Portuguese either way:
    // the audio is always Brazilian Portuguese, so an English example would
    // be showing the reader something they can never type.
    'jokeNamePlaceholder',
    'jokeSpellingsPlaceholder',
  ])

  it('differs between languages where it should', () => {
    const identical = Object.keys(UI.en).filter(
      (key) => UI.en[key as keyof typeof UI.en] === UI.pt[key as keyof typeof UI.pt],
    )

    expect(identical.sort()).toEqual([...DELIBERATELY_IDENTICAL].sort())
  })
})
