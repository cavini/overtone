// US-011 · the link from a count back to the audio
import { describe, expect, it } from 'vitest'
import type { TimedWord } from '../domain/timed-word.js'
import { tokeniseTimed } from './tokenise-timed.js'

const words = (...spellings: Array<[string, number, number]>): TimedWord[] =>
  spellings.map(([text, startMs, endMs]) => ({ text, startMs, endMs }))

describe('tokeniseTimed', () => {
  it('carries each word timing onto its token', () => {
    expect(tokeniseTimed(words(['Olá', 0, 500], ['mundo', 500, 900]), 'pt')).toEqual([
      { surface: 'olá', index: 0, startMs: 0, endMs: 500 },
      { surface: 'mundo', index: 1, startMs: 500, endMs: 900 },
    ])
  })

  it('normalises each word as it goes', () => {
    expect(tokeniseTimed(words(['PIRÃO,', 0, 400]), 'pt').map((t) => t.surface)).toEqual([
      'pirão',
    ])
  })

  // One spoken word, two tokens. Both point at the same moment in the audio,
  // because that is when it was said — splitting the span would invent
  // precision the transcript never gave us.
  it('gives both halves of a split clitic the same span', () => {
    expect(tokeniseTimed(words(['diga-me', 1_000, 1_600]), 'pt')).toEqual([
      { surface: 'diga', index: 0, startMs: 1_000, endMs: 1_600 },
      { surface: 'me', index: 1, startMs: 1_000, endMs: 1_600 },
    ])
  })

  it('drops a word with no letters and keeps the indices contiguous', () => {
    expect(
      tokeniseTimed(words(['um', 0, 300], ['...', 300, 400], ['dois', 400, 700]), 'pt'),
    ).toEqual([
      { surface: 'um', index: 0, startMs: 0, endMs: 300 },
      { surface: 'dois', index: 1, startMs: 400, endMs: 700 },
    ])
  })

  it('handles a word the transcriber returned with spaces inside it', () => {
    const tokens = tokeniseTimed(words(['hot dog', 0, 800]), 'pt')
    expect(tokens.map((t) => t.surface)).toEqual(['hot', 'dog'])
    expect(tokens.every((t) => t.startMs === 0 && t.endMs === 800)).toBe(true)
  })

  it('returns nothing for no words', () => {
    expect(tokeniseTimed([], 'pt')).toEqual([])
  })

  it('agrees with the plain tokeniser on the surfaces it produces', () => {
    const spoken = words(['O', 0, 1], ['pirão', 1, 2], ['diga-me', 2, 3])
    expect(tokeniseTimed(spoken, 'pt').map((t) => t.surface)).toEqual([
      'o', 'pirão', 'diga', 'me',
    ])
  })
})
