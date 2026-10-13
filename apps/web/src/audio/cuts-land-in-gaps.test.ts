// US-040 · "Splitting never cuts a word in half"
//
// The unit tests either side of this one use 0/1 profiles. This runs the
// real numeric path — samples through loudness through settling — on a
// signal shaped like speech: bursts with a noise floor under them, and a
// pause between sentences. Nothing here is a synthetic profile; the only
// piece not exercised is the browser's own decodeAudioData.
import { planChunks, settleChunks } from '@overtone/core'
import { describe, expect, it } from 'vitest'
import { FRAME_MS, loudnessProfile } from './loudness.js'

const SAMPLE_RATE = 16_000

const SENTENCE_MS = 4_000
const PAUSE_MS = 500
const NOISE = 0.004

/**
 * Forty minutes of talking: four-second sentences with half a second of room
 * tone between them. Long enough for three chunks, so there are two seams.
 */
const episode = (durationMs: number): Float32Array => {
  const samples = new Float32Array(Math.round((durationMs / 1000) * SAMPLE_RATE))
  // A fixed pattern rather than randomness — `Math.random` is banned here,
  // and a repeatable signal makes a failure reproducible.
  for (let at = 0; at < samples.length; at += 1) {
    const ms = (at / SAMPLE_RATE) * 1000
    const inCycle = ms % (SENTENCE_MS + PAUSE_MS)
    const speaking = inCycle < SENTENCE_MS

    // Room tone is always there. It is what makes "quiet" relative rather
    // than a comparison against zero.
    const floor = NOISE * Math.sin((at / SAMPLE_RATE) * 2 * Math.PI * 60)
    const voice = speaking ? 0.5 * Math.sin((at / SAMPLE_RATE) * 2 * Math.PI * 180) : 0

    samples[at] = floor + voice
  }

  return samples
}

/** Whether a moment falls in a pause between sentences. */
const inAPause = (ms: number): boolean => {
  const inCycle = ms % (SENTENCE_MS + PAUSE_MS)

  return inCycle >= SENTENCE_MS
}

describe('where the knife actually falls', () => {
  const durationMs = 40 * 60_000
  const planned = planChunks(durationMs)
  const settled = settleChunks(
    planned,
    [...loudnessProfile(episode(durationMs), SAMPLE_RATE)],
    FRAME_MS,
  )

  it('has seams to move in the first place', () => {
    expect(planned.length).toBeGreaterThan(2)
  })

  // The planned boundaries are arithmetic, and the sentence cycle does not
  // divide into them — so this is the situation the feature exists for.
  it('would have cut mid-sentence if left on the clock', () => {
    const midSentence = planned.slice(1).filter((chunk) => !inAPause(chunk.startMs))

    expect(midSentence.length, 'the fixture never cut mid-sentence to begin with')
      .toBeGreaterThan(0)
  })

  it('moves every seam into a pause', () => {
    const stillMidSentence = settled
      .slice(1)
      .map((chunk) => chunk.startMs)
      .filter((startMs) => !inAPause(startMs))

    expect(stillMidSentence, 'seams left in the middle of speech').toEqual([])
  })

  it('does not wander far to get there', () => {
    for (const [at, chunk] of settled.entries()) {
      if (at === 0) continue
      const moved = Math.abs(chunk.startMs - (planned[at]?.startMs ?? 0))
      expect(moved, `seam ${String(at)} wandered ${String(moved)}ms`).toBeLessThanOrEqual(90_000)
    }
  })

  it('still hands every millisecond to exactly one chunk', () => {
    expect(settled[0]?.startMs).toBe(0)
    expect(settled.at(-1)?.endMs).toBe(durationMs)
    for (let at = 1; at < settled.length; at += 1) {
      expect(settled[at]?.startMs).toBe(settled[at - 1]?.endMs)
    }
  })
})
