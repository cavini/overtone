// US-040 · the boundaries an episode was actually cut on
import { describe, expect, it } from 'vitest'
import { chunksFor } from './analyse-upload.js'

const HOUR = 60 * 60_000

describe('chunksFor', () => {
  it('falls back to the plan when nothing was reported', () => {
    const planned = chunksFor({ durationMs: HOUR, chunkStartsMs: null })

    expect(planned.length).toBeGreaterThan(1)
    expect(planned[0]?.startMs).toBe(0)
    expect(planned.at(-1)?.endMs).toBe(HOUR)
  })

  it('uses the settled boundaries when they were', () => {
    const planned = chunksFor({ durationMs: HOUR, chunkStartsMs: null })
    const moved = planned.map((chunk, at) => (at === 0 ? 0 : chunk.startMs + 5_000))

    const settled = chunksFor({ durationMs: HOUR, chunkStartsMs: moved })

    expect(settled.map((chunk) => chunk.startMs)).toEqual(moved)
    expect(settled.at(-1)?.endMs).toBe(HOUR)
  })

  it('still hands every millisecond to exactly one chunk', () => {
    const planned = chunksFor({ durationMs: HOUR, chunkStartsMs: null })
    const moved = planned.map((chunk, at) => (at === 0 ? 0 : chunk.startMs - 7_000))

    const settled = chunksFor({ durationMs: HOUR, chunkStartsMs: moved })

    for (let at = 1; at < settled.length; at += 1) {
      expect(settled[at]?.startMs).toBe(settled[at - 1]?.endMs)
    }
  })

  /*
   * All or nothing. Falling back for a *missing* list is right; falling back
   * for one chunk of a list that exists would offset some chunks by the plan
   * and some by the settled list, in the same episode — a silent corruption
   * of every timestamp after the join, with every number still plausible.
   */
  it('ignores a list of the wrong length rather than patching it', () => {
    const planned = chunksFor({ durationMs: HOUR, chunkStartsMs: null })

    expect(chunksFor({ durationMs: HOUR, chunkStartsMs: [0, 1_000] })).toEqual(planned)
    expect(chunksFor({ durationMs: HOUR, chunkStartsMs: [] })).toEqual(planned)
  })

  it('keeps the indexes it was planned with', () => {
    const settled = chunksFor({ durationMs: HOUR, chunkStartsMs: null })

    expect(settled.map((chunk) => chunk.index)).toEqual(settled.map((_, at) => at))
  })
})
