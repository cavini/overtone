// US-048
import { MATCH_CLOSE, MATCH_OPEN } from '@overtone/core'
import { describe, expect, it } from 'vitest'
import { markedQuote } from './marked-quote.js'

const mark = (word: string) => `${MATCH_OPEN}${word}${MATCH_CLOSE}`

describe('markedQuote', () => {
  it('splits the matched words out of the plain text', () => {
    expect(markedQuote(`falamos do ${mark('cachorro')} ontem`)).toEqual([
      { text: 'falamos do ', matched: false },
      { text: 'cachorro', matched: true },
      { text: ' ontem', matched: false },
    ])
  })

  it('handles a match at the very start and the very end', () => {
    expect(markedQuote(`${mark('a')} b ${mark('c')}`)).toEqual([
      { text: 'a', matched: true },
      { text: ' b ', matched: false },
      { text: 'c', matched: true },
    ])
  })

  it('finds every match, not just the first', () => {
    const parts = markedQuote(`${mark('ano')} e ${mark('anos')} e ${mark('ano')}`)

    expect(parts.filter((part) => part.matched)).toHaveLength(3)
  })

  it('passes text through when nothing matched', () => {
    expect(markedQuote('nada marcado aqui')).toEqual([
      { text: 'nada marcado aqui', matched: false },
    ])
  })

  it('has nothing to show for an empty quote', () => {
    expect(markedQuote('')).toEqual([])
  })

  // The control characters must never reach the page as characters.
  it('leaves no markers in the text it returns', () => {
    for (const part of markedQuote(`x ${mark('y')} z`)) {
      expect(part.text).not.toContain(MATCH_OPEN)
      expect(part.text).not.toContain(MATCH_CLOSE)
    }
  })

  /*
   * Truncation has to count the words, not the string.
   *
   * The markers are characters too, so cutting the raw string at 220 would
   * cut a different amount of actual text depending on how many matches it
   * held — and could slice a marker in half, leaving a control character on
   * screen.
   */
  it('truncates by visible text and never mid-marker', () => {
    const long = `${'a'.repeat(200)} ${mark('cachorro')} ${'b'.repeat(200)}`
    const parts = markedQuote(long, 220)
    const shown = parts.map((part) => part.text).join('')

    expect(shown.length).toBeLessThanOrEqual(221)
    expect(shown).not.toContain(MATCH_OPEN)
    expect(shown).not.toContain(MATCH_CLOSE)
  })

  it('keeps the match when it falls inside the limit', () => {
    const parts = markedQuote(`${mark('cachorro')} ${'b'.repeat(500)}`, 50)

    expect(parts[0]).toEqual({ text: 'cachorro', matched: true })
  })
})
