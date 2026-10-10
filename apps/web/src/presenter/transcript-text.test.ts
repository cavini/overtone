// US-010
import { describe, expect, it } from 'vitest'
import { partsAfter } from './transcript-text.js'

/** A chunk as the store hands it over: an index and its words. */
const chunk = (index: number, ...words: readonly string[]) => ({
  index,
  words: words.map((text) => ({ text, startMs: 0, endMs: 0 })),
})

describe('partsAfter', () => {
  it('has nothing for an episode with no chunks yet', () => {
    expect(partsAfter([], 0)).toEqual({ parts: [], nextFrom: 0 })
  })

  it('reads every chunk as text, in order', () => {
    expect(partsAfter([chunk(0, 'bom', 'dia'), chunk(1, 'pirão')], 0)).toEqual({
      parts: [
        { index: 0, text: 'bom dia' },
        { index: 1, text: 'pirão' },
      ],
      nextFrom: 2,
    })
  })

  it('orders by index however the rows arrived', () => {
    expect(partsAfter([chunk(1, 'dois'), chunk(0, 'um')], 0).parts).toEqual([
      { index: 0, text: 'um' },
      { index: 1, text: 'dois' },
    ])
  })

  // The whole point of the cursor. A two-hour episode is roughly 20,000
  // words, and a reader waiting on the next chunk asks again every few
  // seconds — sending what they are already reading, every time, is the one
  // way this feature could cost real money on a free tier.
  it('sends only what the reader does not have yet', () => {
    expect(partsAfter([chunk(0, 'um'), chunk(1, 'dois')], 1)).toEqual({
      parts: [{ index: 1, text: 'dois' }],
      nextFrom: 2,
    })
  })

  it('sends nothing at all once the reader is up to date', () => {
    expect(partsAfter([chunk(0, 'um')], 1)).toEqual({ parts: [], nextFrom: 1 })
  })

  // Chunks are paced against the allowance rather than fanned out, so they
  // normally land in order — but nothing guarantees it, and chunk three read
  // before chunk two is a transcript that lies about the episode. Holding at
  // the gap costs one poll; reading across it is wrong.
  it('stops at a gap rather than reading out of order', () => {
    expect(partsAfter([chunk(0, 'um'), chunk(2, 'três')], 0)).toEqual({
      parts: [{ index: 0, text: 'um' }],
      nextFrom: 1,
    })
  })

  // Silence, or a stretch of music. A chunk that came back with no words is
  // still a transcribed chunk, so the cursor has to move past it — treating
  // it as a gap would stall the reading there for the rest of the episode.
  it('moves past a chunk that came back silent', () => {
    expect(partsAfter([chunk(0), chunk(1, 'depois')], 0)).toEqual({
      parts: [
        { index: 0, text: '' },
        { index: 1, text: 'depois' },
      ],
      nextFrom: 2,
    })
  })

  // The cursor arrives as a query string, so it can be anything at all.
  it('reads from the beginning when the cursor is before it', () => {
    expect(partsAfter([chunk(0, 'um')], -3)).toEqual({
      parts: [{ index: 0, text: 'um' }],
      nextFrom: 1,
    })
  })
})
