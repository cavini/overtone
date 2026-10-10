// US-010 · a chunk should not start the episode over
import { describe, expect, it } from 'vitest'
import { PROMPT_TAIL_CHARS, precedingTail } from './preceding-tail.js'

const chunk = (index: number, ...words: readonly string[]) => ({
  index,
  offsetMs: index * 600_000,
  words: words.map((text, i) => ({ text, startMs: i * 400, endMs: i * 400 + 400 })),
})

describe('precedingTail', () => {
  it('is the words of the chunk just before this one', () => {
    expect(precedingTail([chunk(0, 'bom', 'dia'), chunk(1, 'pirão')], 1)).toBe('bom dia')
  })

  // The first chunk has nothing before it, and the model treats an empty
  // prompt as a prompt — a blank one is not the same as none.
  it('has nothing for the chunk that starts the episode', () => {
    expect(precedingTail([chunk(0, 'bom')], 0)).toBeUndefined()
  })

  // Chunks are paced one at a time but nothing guarantees arrival order, and
  // a gap is not the previous chunk.
  it('has nothing when the chunk before it has not come back', () => {
    expect(precedingTail([chunk(0, 'bom'), chunk(2, 'tarde')], 2)).toBeUndefined()
  })

  it('has nothing when the chunk before it came back silent', () => {
    expect(precedingTail([chunk(0), chunk(1, 'depois')], 1)).toBeUndefined()
  })

  /*
   * The provider caps the prompt, and the useful part of it is the end —
   * the sentence this chunk is carrying on from, not whatever was being
   * said twelve minutes ago.
   */
  it('keeps only the end of a long chunk', () => {
    const long = chunk(0, ...Array.from({ length: 400 }, (_, i) => `w${i}`))
    const tail = precedingTail([long, chunk(1, 'x')], 1) ?? ''

    expect(tail.length).toBeLessThanOrEqual(PROMPT_TAIL_CHARS)
    expect(tail.endsWith('w399')).toBe(true)
  })

  it('does not cut a word in half', () => {
    const long = chunk(0, ...Array.from({ length: 400 }, () => 'palavra'))
    expect(precedingTail([long, chunk(1, 'x')], 1)?.startsWith('palavra')).toBe(true)
  })
})
