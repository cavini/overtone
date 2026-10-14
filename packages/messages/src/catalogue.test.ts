// US-045, US-046 · ADR 0017
import { describe, expect, it } from 'vitest'
import { LOCALES, MESSAGE_CODES, MESSAGE_PARAMS, type MessageCode } from './codes.js'
import en from './en.json' with { type: 'json' }
import pt from './pt.json' with { type: 'json' }

const CATALOGUES: Record<string, Record<string, string>> = { pt, en }

/** Pulls `{name}` and `{name, number}` placeholders out of an ICU string. */
const placeholdersIn = (message: string): string[] =>
  [...message.matchAll(/\{\s*([a-z_]+)\s*(?:,[^}]*)?\}/gu)].map((match) => match[1] ?? '')

const paramsFor = (code: MessageCode): string[] =>
  Object.keys(MESSAGE_PARAMS[code] as Record<string, unknown>)

describe('message codes', () => {
  it('has no duplicates', () => {
    expect(new Set(MESSAGE_CODES).size).toBe(MESSAGE_CODES.length)
  })

  /*
   * A tripwire, not a fact worth knowing. Both catalogues are checked below
   * for a message per code, so what this adds is noticing that a code was
   * added at all — the moment to ask whether both languages got a sentence
   * and whether the presenter renders it.
   *
   * 49 since the two password rules (US-052).
   */
  it('matches the count the catalogues are kept to', () => {
    expect(MESSAGE_CODES).toHaveLength(49)
  })

  it('names every code in SCREAMING_SNAKE_CASE', () => {
    for (const code of MESSAGE_CODES) {
      expect(code).toMatch(/^[A-Z][A-Z0-9_]*$/)
    }
  })
})

describe.each(LOCALES)('the %s catalogue', (locale) => {
  const catalogue = CATALOGUES[locale] ?? {}

  // A code with no translation would reach a user as a raw identifier, so
  // this is the test that makes a missing translation impossible to ship.
  it('renders every code', () => {
    const missing = MESSAGE_CODES.filter((code) => catalogue[code] === undefined)
    expect(missing).toEqual([])
  })

  it('renders nothing that is not a code', () => {
    const extra = Object.keys(catalogue).filter(
      (key) => !(MESSAGE_CODES as readonly string[]).includes(key),
    )
    expect(extra).toEqual([])
  })

  it('leaves no message empty', () => {
    for (const code of MESSAGE_CODES) {
      expect((catalogue[code] ?? '').trim().length).toBeGreaterThan(0)
    }
  })

  // A placeholder with no declared parameter renders as literal braces in
  // front of the reader.
  it('uses only parameters the code declares', () => {
    for (const code of MESSAGE_CODES) {
      const declared = paramsFor(code)
      const used = placeholdersIn(catalogue[code] ?? '')
      const undeclared = used.filter((name) => !declared.includes(name))
      expect(undeclared, `${locale}/${code}`).toEqual([])
    }
  })

  // Every number must pass through the locale formatter. pt-BR writes
  // `1.234,56` and English `1,234.56`, and the whole output of this product
  // is numbers — a separator in the wrong place is a wrong number, not a
  // cosmetic slip.
  it('formats every numeric parameter through the locale', () => {
    for (const code of MESSAGE_CODES) {
      const message = catalogue[code] ?? ''
      const numeric = Object.entries(MESSAGE_PARAMS[code] as Record<string, string>)
        .filter(([, kind]) => kind === 'number')
        .map(([name]) => name)

      for (const name of numeric) {
        const bare = new RegExp(`\\{\\s*${name}\\s*\\}`, 'u')
        expect(bare.test(message), `${locale}/${code}: {${name}} needs a format`).toBe(
          false,
        )
      }
    }
  })

  it('hard-codes no digit a parameter should have carried', () => {
    for (const code of MESSAGE_CODES) {
      const withoutPlaceholders = (catalogue[code] ?? '').replace(/\{[^}]*\}/gu, '')
      // "100" survives as the scale of a quality score, which is a fixed
      // property of the scale rather than data.
      const digits = withoutPlaceholders.replace(/100/gu, '').match(/\d+/gu) ?? []
      expect(digits, `${locale}/${code}`).toEqual([])
    }
  })
})

describe('the two catalogues together', () => {
  it('cover exactly the same codes', () => {
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort())
  })

  // The invariant from ADR 0017. Switching language changes the words and
  // nothing else; a count must never move because someone switched locale.
  it('differ in wording, not in which data they need', () => {
    for (const code of MESSAGE_CODES) {
      const inPt = new Set(placeholdersIn((pt as Record<string, string>)[code] ?? ''))
      const inEn = new Set(placeholdersIn((en as Record<string, string>)[code] ?? ''))
      const declared = new Set(paramsFor(code))

      for (const name of [...inPt, ...inEn]) {
        expect(declared.has(name), `${code}: {${name}}`).toBe(true)
      }
    }
  })
})
