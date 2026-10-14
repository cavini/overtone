// US-045, US-046 · ADR 0017
import { describe, expect, it } from 'vitest'
import { LOCALES, MESSAGE_CODES, MESSAGE_PARAMS, type MessageCode } from './codes.js'
import { renderMessage } from './render.js'

/**
 * Plausible data for any code, built from its declaration so the sweep below
 * cannot fall behind the catalogue.
 */
const sampleParams = (code: MessageCode): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(MESSAGE_PARAMS[code] as Record<string, string>).map(([name, kind]) => [
      name,
      kind === 'number' ? 1234 : kind === 'strings' ? ['mp3', 'm4a', 'wav'] : 'exemplo',
    ]),
  )

describe('renderMessage', () => {
  it('renders the same code in both languages', () => {
    const pt = renderMessage('pt', 'STATUS_READY', {})
    const en = renderMessage('en', 'STATUS_READY', {})
    expect(pt).toBe('Pronto')
    expect(en).toBe('Ready')
  })

  it('interpolates a string parameter', () => {
    expect(renderMessage('pt', 'TOPIC_NAME_TAKEN', { name: 'Guardachuva' })).toContain(
      '"Guardachuva"',
    )
  })

  // The reason number formatting is correctness here and not polish: the
  // entire output of this product is numbers, and `1.234` means one thousand
  // to a Brazilian reader and one-point-two-three-four to an English one.
  it('formats numbers the way each locale writes them', () => {
    const params = { done: 1234, total: 5678 }
    expect(renderMessage('pt', 'CHUNK_PROGRESS', params)).toContain('1.234')
    expect(renderMessage('en', 'CHUNK_PROGRESS', params)).toContain('1,234')
  })

  it('formats a percentage per locale', () => {
    const rendered = renderMessage('pt', 'UPLOAD_COST_PREVIEW', {
      duration_ms: 7_200_000,
      daily_allowance_hours: 8,
      share_of_daily: 0.25,
    })
    expect(rendered).toContain('25')
    expect(rendered).toContain('%')
  })

  // `mp3, m4a e wav` in Portuguese; `mp3, m4a and wav` in English. A joined
  // list is the kind of thing that quietly reads as machine translation if
  // the conjunction is wrong.
  it('joins a list with the right conjunction for the locale', () => {
    const accepted = ['mp3', 'm4a', 'wav']
    expect(renderMessage('pt', 'UNSUPPORTED_FORMAT', { extension: '.docx', accepted }))
      .toContain('mp3, m4a e wav')
    expect(renderMessage('en', 'UNSUPPORTED_FORMAT', { extension: '.docx', accepted }))
      .toContain('mp3, m4a and wav')
  })

  // Sweeps every message in both languages. Catches a malformed ICU string,
  // a placeholder with no matching parameter, and a broken format — none of
  // which the parity test can see, because they only fail when rendered.
  describe.each(LOCALES)('every message renders in %s', (locale) => {
    it.each(MESSAGE_CODES)('%s', (code) => {
      const rendered = renderMessage(locale, code, sampleParams(code) as never)
      expect(rendered).toBeTypeOf('string')
      expect(rendered.trim().length).toBeGreaterThan(0)
      // A leftover brace means a placeholder never got substituted.
      expect(rendered).not.toMatch(/[{}]/u)
    })
  })

  // Defensive, and deliberately not a throw. A missing catalogue entry is
  // caught by the parity test long before release; if one ever slipped
  // through, showing the code is ugly but legible, whereas a thrown error
  // would take the page down over a piece of copy.
  it('falls back to the code itself if a catalogue entry is missing', () => {
    expect(renderMessage('pt', 'NOT_A_REAL_CODE' as never, {} as never)).toBe(
      'NOT_A_REAL_CODE',
    )
  })

  it('leaves a non-list parameter alone', () => {
    expect(
      renderMessage('pt', 'UNSUPPORTED_FORMAT', {
        extension: '.docx',
        accepted: 'mp3' as unknown as readonly string[],
      }),
    ).toContain('mp3')
  })

  it('renders the same input identically every time', () => {
    const params = { chunk_index: 3, chunk_count: 6, succeeded_count: 5 }
    expect(renderMessage('pt', 'CHUNK_FAILED', params)).toBe(
      renderMessage('pt', 'CHUNK_FAILED', params),
    )
  })
})
