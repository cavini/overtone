// US-040
//
// Measured on the first real multi-chunk episode: the transcriber gave the
// last 5 of a chunk's 1557 words timestamps about 24 seconds past the end of
// the audio it was handed. Everything before them was correct, and the seams
// themselves were right — no word was cut in half and nothing was repeated.
//
// Left alone, those words are offset into the *next* chunk's stretch of the
// episode, so two chunks claim the same moment and a quote points at the
// wrong one. Exactly the silent failure this file's sibling warns about.
import { describe, expect, it } from 'vitest'
import { stitchChunks } from './chunking.js'

const chunk = (
  index: number,
  offsetMs: number,
  words: ReadonlyArray<readonly [string, number]>,
) => ({
  index,
  offsetMs,
  words: words.map(([text, startMs]) => ({ text, startMs, endMs: startMs + 100 })),
})

const stitched = (chunks: Parameters<typeof stitchChunks>[0]) =>
  stitchChunks(chunks).map((word) => [word.text, word.startMs] as const)

describe('a chunk cannot spill into the next one', () => {
  it('holds a word back to its own chunk when the transcriber overran', () => {
    const words = stitched([
      chunk(0, 0, [
        ['dentro', 1_000],
        // 30 s past where chunk 1 starts: the transcriber kept going after
        // the audio stopped.
        ['depois', 630_000],
      ]),
      chunk(1, 600_000, [['seguinte', 0]]),
    ])

    const overran = words.find(([text]) => text === 'depois')
    expect(overran?.[1]).toBeLessThan(600_000)
  })

  /*
   * Held back, not dropped. The word was said — it is in the audio near the
   * end of its own chunk — so removing it would take a real word out of
   * every count on the page to fix a timestamp. A count that is wrong is
   * worse than a timestamp that is approximate.
   */
  it('keeps every word it was given', () => {
    const words = stitched([
      chunk(0, 0, [
        ['um', 0],
        ['dois', 700_000],
        ['três', 800_000],
      ]),
      chunk(1, 600_000, [['quatro', 0]]),
    ])

    expect(words.map(([text]) => text)).toEqual(['um', 'dois', 'três', 'quatro'])
  })

  it('leaves the order alone', () => {
    const words = stitched([
      chunk(0, 0, [
        ['um', 0],
        ['dois', 700_000],
      ]),
      chunk(1, 600_000, [['três', 0]]),
    ])

    const times = words.map(([, at]) => at)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })

  // Nothing bounds the last chunk — there is no next offset, and the episode
  // duration is not something this knows. A transcriber overrunning the final
  // chunk puts a word past the end of the episode, which reads as the last
  // moment rather than as somebody else's.
  it('does not bound the final chunk', () => {
    const words = stitched([chunk(0, 0, [['fim', 900_000]])])

    expect(words).toEqual([['fim', 900_000]])
  })

  // The ordinary case, which is every chunk of every episode so far: a
  // transcript that fits inside its own audio comes back untouched.
  it('changes nothing when no chunk overran', () => {
    const words = stitched([
      chunk(0, 0, [
        ['bom', 1_000],
        ['dia', 599_000],
      ]),
      chunk(1, 600_000, [['tarde', 500]]),
    ])

    expect(words).toEqual([
      ['bom', 1_000],
      ['dia', 599_000],
      ['tarde', 600_500],
    ])
  })
})
