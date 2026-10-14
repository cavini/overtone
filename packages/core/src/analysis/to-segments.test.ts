// US-010, US-011 · the transcript reader, and what a quote links to
import { describe, expect, it } from 'vitest'
import type { TimedWord } from '../domain/timed-word.js'
import { annotate } from './annotate.js'
import { toSegments } from './to-segments.js'
import { tokeniseTimed } from './tokenise-timed.js'

const spoken = (...texts: string[]): TimedWord[] =>
  texts.map((text, i) => ({ text, startMs: i * 400, endMs: i * 400 + 400 }))

const segmentsOf = (words: readonly TimedWord[], maxWords?: number) =>
  toSegments(words, annotate(tokeniseTimed(words, 'pt'), new Map(), 'pt'), maxWords)

describe('toSegments', () => {
  it('breaks at the end of a sentence', () => {
    const segments = segmentsOf(spoken('Olá', 'galera.', 'Hoje', 'falamos', 'disso.'))
    expect(segments.map((s) => s.text)).toEqual(['Olá galera.', 'Hoje falamos disso.'])
  })

  it.each(['.', '!', '?', '...'])('breaks after %s', (mark) => {
    expect(segmentsOf(spoken(`pronto${mark}`, 'depois'))).toHaveLength(2)
  })

  it('keeps the original spelling, not the normalised one', () => {
    expect(segmentsOf(spoken('FEIJÃO,', 'pronto.'))[0]?.text).toBe('FEIJÃO, pronto.')
  })

  it('numbers the segments in order', () => {
    const segments = segmentsOf(spoken('um.', 'dois.', 'três.'))
    expect(segments.map((s) => s.position)).toEqual([0, 1, 2])
  })

  // What a quote links to: a timestamp the player can seek to.
  it('spans from its first word to its last', () => {
    const segments = segmentsOf(spoken('um', 'dois.', 'três'))
    expect(segments[0]).toMatchObject({ startMs: 0, endMs: 800 })
    expect(segments[1]).toMatchObject({ startMs: 800, endMs: 1_200 })
  })

  // Transcribed speech sometimes runs on for a very long time with no
  // punctuation at all, and one enormous paragraph is unreadable.
  it('breaks a run-on anyway once it gets too long', () => {
    const words = spoken(...Array.from({ length: 10 }, (_, i) => `palavra${i}`))
    expect(segmentsOf(words, 4).map((s) => s.words.length)).toEqual([4, 4, 2])
  })

  it('carries the analysed words so a count can point into the audio', () => {
    const [segment] = segmentsOf(spoken('O', 'feijão.'))
    expect(segment?.words).toEqual([
      expect.objectContaining({ surface: 'o', tokenClass: 'stopword' }),
      expect.objectContaining({ surface: 'feijão', tokenClass: 'word' }),
    ])
  })

  // One spoken word, two tokens: both belong to the segment it was said in.
  it('keeps a split clitic inside one segment', () => {
    const [segment] = segmentsOf(spoken('diga-me.'))
    expect(segment?.words.map((w) => w.surface)).toEqual(['diga', 'me'])
  })

  it('drops a word that normalises away without leaving a gap', () => {
    const segments = segmentsOf(spoken('um', '...', 'dois.'))
    expect(segments).toHaveLength(1)
    expect(segments[0]?.words.map((w) => w.surface)).toEqual(['um', 'dois'])
  })

  it('returns nothing for silence', () => {
    expect(toSegments([], [])).toEqual([])
  })

  it('is deterministic', () => {
    const words = spoken('Olá', 'galera.', 'Tudo', 'bem?')
    expect(JSON.stringify(segmentsOf(words))).toBe(JSON.stringify(segmentsOf(words)))
  })
})

/*
 * The gap between the two time scales. A token is placed by looking in the
 * ten-second slot it falls in, and a segment's window is whatever it happens
 * to be — so a token can land in a slot that holds a segment and still be
 * outside that segment's window, and a token can land in a slot holding no
 * segment at all.
 *
 * Both have to drop the token rather than attach it to the nearest thing,
 * which is what the filter this replaced did.
 */
describe('a token that belongs to no segment', () => {
  it('is left out rather than attached to the nearest one', () => {
    const words: TimedWord[] = [
      { text: 'olá.', startMs: 0, endMs: 500 },
      { text: 'tchau.', startMs: 60_000, endMs: 60_500 },
    ]
    const tokens = annotate(tokeniseTimed(words, 'pt'), new Map(), 'pt', new Set())

    // A token from nowhere: between the two segments, and in a slot of its
    // own that holds neither.
    const stray = { ...(tokens[0] as (typeof tokens)[number]), startMs: 30_000, endMs: 30_100 }

    const segments = toSegments(words, [...tokens, stray], 40)

    expect(segments).toHaveLength(2)
    expect(segments.flatMap((segment) => segment.words.map((word) => word.startMs))).toEqual([
      0, 60_000,
    ])
  })
})
