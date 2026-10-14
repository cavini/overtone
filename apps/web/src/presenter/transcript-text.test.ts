// US-010
import { describe, expect, it } from 'vitest'
import { linesAfter } from './transcript-text.js'

/**
 * A chunk as the store hands it over.
 *
 * Its word timings start at zero — each chunk is transcribed on its own —
 * and `offsetMs` is where it began in the episode.
 */
const chunk = (index: number, offsetMs: number, ...words: readonly string[]) => ({
  index,
  offsetMs,
  words: words.map((text, i) => ({ text, startMs: i * 500, endMs: i * 500 + 500 })),
})

const texts = (result: { lines: readonly { text: string }[] }) =>
  result.lines.map((line) => line.text)

describe('linesAfter', () => {
  it('has nothing for an episode with no chunks yet', () => {
    expect(linesAfter([], 0)).toEqual({ lines: [], nextFrom: 0 })
  })

  it('reads every chunk, in order', () => {
    expect(texts(linesAfter([chunk(0, 0, 'bom', 'dia.'), chunk(1, 9_000, 'feijão.')], 0))).toEqual([
      'bom dia.',
      'feijão.',
    ])
  })

  // The timings are what a search result seeks to, and each chunk's come
  // back starting at zero. A line reported at its chunk-relative time would
  // send every result after the first chunk to the wrong moment.
  it('times each line from the start of the episode, not of its chunk', () => {
    const { lines } = linesAfter([chunk(0, 0, 'um.'), chunk(1, 9_000, 'dois.')], 0)
    expect(lines.map((line) => line.startMs)).toEqual([0, 9_000])
  })

  it('breaks a chunk into one line per sentence', () => {
    expect(texts(linesAfter([chunk(0, 0, 'Olá', 'galera.', 'Hoje', 'não.')], 0))).toEqual([
      'Olá galera.',
      'Hoje não.',
    ])
  })

  it('keys each line by its chunk and its place in it', () => {
    const { lines } = linesAfter([chunk(0, 0, 'um.', 'dois.')], 0)
    expect(lines.map((line) => [line.chunk, line.position])).toEqual([
      [0, 0],
      [0, 1],
    ])
  })

  it('orders by index however the rows arrived', () => {
    expect(texts(linesAfter([chunk(1, 9_000, 'dois'), chunk(0, 0, 'um')], 0))).toEqual([
      'um',
      'dois',
    ])
  })

  // The whole point of the cursor. A two-hour episode is roughly 20,000
  // words, and a reader waiting on the next chunk asks again every few
  // seconds — sending what they are already reading, every time, is the one
  // way this feature could cost real money on a free tier.
  it('sends only what the reader does not have yet', () => {
    const result = linesAfter([chunk(0, 0, 'um'), chunk(1, 9_000, 'dois')], 1)
    expect([texts(result), result.nextFrom]).toEqual([['dois'], 2])
  })

  it('sends nothing at all once the reader is up to date', () => {
    expect(linesAfter([chunk(0, 0, 'um')], 1)).toEqual({ lines: [], nextFrom: 1 })
  })

  // Chunks are paced against the allowance rather than fanned out, so they
  // normally land in order — but nothing guarantees it, and chunk three read
  // before chunk two is a transcript that lies about the episode. Holding at
  // the gap costs one poll; reading across it is wrong.
  it('stops at a gap rather than reading out of order', () => {
    const result = linesAfter([chunk(0, 0, 'um'), chunk(2, 18_000, 'três')], 0)
    expect([texts(result), result.nextFrom]).toEqual([['um'], 1])
  })

  // Silence, or a stretch of music. A chunk that came back with no words is
  // still a transcribed chunk, so the cursor has to move past it — treating
  // it as a gap would stall the reading there for the rest of the episode,
  // and it has no line of its own because an empty paragraph is a hole in
  // the page that nothing on it explains.
  it('moves past a chunk that came back silent', () => {
    const result = linesAfter([chunk(0, 0), chunk(1, 9_000, 'depois')], 0)
    expect([texts(result), result.nextFrom]).toEqual([['depois'], 2])
  })

  // The cursor arrives as a query string, so it can be anything at all.
  it('reads from the beginning when the cursor is before it', () => {
    const result = linesAfter([chunk(0, 0, 'um')], -3)
    expect([texts(result), result.nextFrom]).toEqual([['um'], 1])
  })

/*
 * The bug this file shipped with.
 *
 * A correction changed the counts, the search index and the stored
 * transcript — and the page kept showing the misheard line, because the
 * reader builds from the chunks and the overlay was only ever applied in
 * the analysis. Reported from production with the words still wrong after a
 * refresh, which is the only way anybody would have found it: everything a
 * test looked at was already right.
 */
describe('a line somebody corrected', () => {
  const chunk = {
    index: 0,
    offsetMs: 0,
    words: [
      { text: 'tô', startMs: 3_580, endMs: 3_680 },
      { text: 'mostrando', startMs: 3_700, endMs: 3_900 },
      { text: 'a', startMs: 3_940, endMs: 4_000 },
      { text: 'saia', startMs: 4_040, endMs: 4_140 },
      { text: 'agora,', startMs: 4_160, endMs: 4_500 },
      { text: 'velho.', startMs: 4_580, endMs: 4_900 },
    ],
    segmentStartsMs: [],
  }

  it('reads as what was typed, not as what was heard', () => {
    const { lines } = linesAfter([chunk], 0, [
      { fromMs: 3_580, toMs: 4_581, text: 'Tô saindo de casa agora, velho.' },
    ])

    const read = lines.map((line) => line.text).join(' ')
    expect(read).toContain('saindo de casa')
    expect(read).not.toContain('mostrando')
  })

  it('still reads as what was heard when nothing was corrected', () => {
    const { lines } = linesAfter([chunk], 0)

    expect(lines.map((line) => line.text).join(' ')).toContain('mostrando a saia')
  })

  // The span the UI sends is the line's own, so a correction must not reach
  // past it into the words either side.
  it('leaves the lines around it alone', () => {
    const longer = {
      ...chunk,
      words: [
        { text: 'antes.', startMs: 1_000, endMs: 1_200 },
        ...chunk.words,
        { text: 'depois.', startMs: 6_000, endMs: 6_200 },
      ],
    }

    const { lines } = linesAfter([longer], 0, [
      { fromMs: 3_580, toMs: 4_581, text: 'meio.' },
    ])

    const read = lines.map((line) => line.text).join(' ')
    expect(read).toContain('antes.')
    expect(read).toContain('depois.')
    expect(read).not.toContain('saia')
  })
})

/*
 * The second half of the same bug, reported from production.
 *
 * A span taken from one line's own words stops at its last word's start.
 * Any original word between that and the next line survived the correction
 * and showed up as a line of its own — "velho." sitting under the line it
 * had been part of.
 */
describe('a correction that stops short of the next line', () => {
  const chunk = {
    index: 0,
    offsetMs: 0,
    words: [
      { text: 'tô', startMs: 3_580, endMs: 3_680 },
      { text: 'mostrando', startMs: 3_700, endMs: 3_900 },
      { text: 'a', startMs: 3_940, endMs: 4_000 },
      { text: 'saia', startMs: 4_040, endMs: 4_140 },
      { text: 'agora,', startMs: 4_160, endMs: 4_500 },
      { text: 'velho.', startMs: 4_580, endMs: 4_900 },
    ],
    segmentStartsMs: [],
  }

  it('leaves the word it did not reach behind', () => {
    const { lines } = linesAfter([chunk], 0, [
      { fromMs: 3_580, toMs: 4_249, text: 'Tô saindo de casa agora, velho.' },
    ])

    // The behaviour that was reported: a stray line below the corrected one.
    expect(lines.map((line) => line.text)).toContain('velho.')
  })

  it('covers the line when the span runs to where the next one starts', () => {
    const { lines } = linesAfter([chunk], 0, [
      { fromMs: 3_580, toMs: 4_581, text: 'Tô saindo de casa agora, velho.' },
    ])

    expect(lines.map((line) => line.text).join(' | ')).toBe('Tô saindo de casa agora, velho.')
  })
})
})
