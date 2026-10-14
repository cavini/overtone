// US-049 · fixing a line the transcriber got wrong
//
// A correction replaces a stretch of the episode's words with what was
// actually said. Everything downstream — counts, running jokes, search, the
// series view — is re-derived from the corrected stream, so this is the one
// function that decides what the numbers are about.
import { describe, expect, it } from 'vitest'
import type { TimedWord } from '../domain/timed-word.js'
import { applyCorrections } from './corrections.js'

const words = (...spoken: Array<[text: string, startMs: number]>): TimedWord[] =>
  spoken.map(([text, startMs]) => ({ text, startMs, endMs: startMs + 300 }))

const said = (from: TimedWord[]): string => from.map((word) => word.text).join(' ')

/** "Tô mostrando a saia agora" — five words across one second. */
const line = words(
  ['tô', 0],
  ['mostrando', 200],
  ['a', 400],
  ['saia', 600],
  ['agora', 800],
)

describe('applyCorrections', () => {
  it('leaves the words alone when there is nothing to correct', () => {
    expect(applyCorrections(line, [])).toEqual(line)
  })

  it('puts the typed words in place of the ones in the span', () => {
    const fixed = applyCorrections(line, [
      { fromMs: 0, toMs: 1_000, text: 'tô começando a sair de casa agora' },
    ])

    expect(said(fixed)).toBe('tô começando a sair de casa agora')
  })

  /*
   * The line's own span is kept, whatever is typed into it. Those two
   * numbers were measured from the audio and are the reason a count can be
   * clicked — so a correction may change the words inside a line and never
   * where the line sits.
   */
  it('keeps the correction inside the span it was made in', () => {
    const fixed = applyCorrections(line, [
      { fromMs: 0, toMs: 1_000, text: 'uma duas três quatro cinco seis sete oito' },
    ])

    expect(fixed[0]?.startMs).toBe(0)
    expect(fixed.at(-1)?.endMs).toBeLessThanOrEqual(1_000)
    for (const word of fixed) {
      expect(word.startMs).toBeGreaterThanOrEqual(0)
      expect(word.endMs).toBeLessThanOrEqual(1_000)
    }
  })

  it('spreads the typed words evenly across the span', () => {
    const fixed = applyCorrections(line, [{ fromMs: 0, toMs: 1_000, text: 'um dois' }])

    expect(fixed.map((word) => word.startMs)).toEqual([0, 500])
  })

  it('never puts two words at the same moment', () => {
    const fixed = applyCorrections(line, [
      { fromMs: 0, toMs: 1_000, text: 'a b c d e f g h i j k l' },
    ])

    const starts = fixed.map((word) => word.startMs)
    expect(new Set(starts).size).toBe(starts.length)
  })

  it('leaves everything outside the span exactly as it was', () => {
    const longer = [...line, ...words(['velho', 1_200], ['beleza', 1_400])]

    const fixed = applyCorrections(longer, [{ fromMs: 0, toMs: 1_000, text: 'nada' }])

    expect(fixed.slice(-2)).toEqual(longer.slice(-2))
  })

  it('keeps the words in order, with the correction where the old words were', () => {
    const longer = [...words(['antes', -400]), ...line, ...words(['depois', 1_200])]

    const fixed = applyCorrections(longer, [{ fromMs: 0, toMs: 1_000, text: 'meio' }])

    expect(said(fixed)).toBe('antes meio depois')
  })

  /*
   * An empty correction deletes. The transcriber sometimes invents a line
   * out of a cough or a bit of music, and there is no text that fixes that
   * — only taking it out.
   */
  it('removes the line when the correction is empty', () => {
    const longer = [...line, ...words(['depois', 1_200])]

    expect(said(applyCorrections(longer, [{ fromMs: 0, toMs: 1_000, text: '   ' }]))).toBe('depois')
  })

  it('applies more than one correction', () => {
    const longer = [...line, ...words(['velho', 1_200], ['beleza', 1_400])]

    const fixed = applyCorrections(longer, [
      { fromMs: 0, toMs: 1_000, text: 'um' },
      { fromMs: 1_100, toMs: 1_600, text: 'dois' },
    ])

    expect(said(fixed)).toBe('um dois')
  })

  /*
   * Word start times are not sorted — 4.5% of them run backwards in a real
   * episode, because people talk over each other. Anything here that assumed
   * order would drop words silently.
   */
  it('survives word timings that run backwards', () => {
    const jumbled = words(['um', 0], ['dois', 500], ['tres', 450], ['quatro', 900])

    const fixed = applyCorrections(jumbled, [{ fromMs: 400, toMs: 600, text: 'X' }])

    expect(said(fixed)).toBe('um X quatro')
  })

  it.each([
    ['nothing at all', [] as TimedWord[]],
    ['one word', words(['só', 0])],
  ])('survives %s', (_what, given) => {
    expect(() => applyCorrections(given, [{ fromMs: 0, toMs: 100, text: 'x' }])).not.toThrow()
  })

  // A span of no length cannot hold a word, so there is nowhere to put one.
  it('ignores a correction with no span', () => {
    expect(applyCorrections(line, [{ fromMs: 500, toMs: 500, text: 'x' }])).toEqual(line)
  })
})
