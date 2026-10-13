import type { ChunkTranscript } from '../domain/audio-chunk.js'
// US-040 · ADR 0011, ADR 0020
import { describe, expect, it } from 'vitest'
import type { TimedWord } from '../domain/timed-word.js'
import {
  CHUNK_TARGET_MS,
  SINGLE_CHUNK_LIMIT_MS,
  missingChunks,
  planChunks,
  planFromTranscripts,
  stitchChunks,
} from './chunking.js'
import { HOURLY_ALLOWANCE_MS } from './pacing.js'

const minutes = (n: number) => n * 60_000

/** The show's real episode length: 2 h 06 m 31 s. */
const REAL_EPISODE = 7_591_000

describe('planChunks', () => {
  /*
   * Expressed against the limit rather than a literal. This said twelve
   * minutes, which was the chunk target at the time — so lowering the
   * target to make room for seam-moving broke a test about something else
   * entirely.
   */
  it('leaves an episode under the single-chunk limit whole', () => {
    const short = SINGLE_CHUNK_LIMIT_MS - 1_000

    expect(planChunks(short)).toEqual([{ index: 0, startMs: 0, endMs: short }])
  })

  it('splits one that is over it', () => {
    expect(planChunks(SINGLE_CHUNK_LIMIT_MS + 1_000).length).toBeGreaterThan(1)
  })

  it('covers the episode exactly, with no gap and no overlap', () => {
    const chunks = planChunks(REAL_EPISODE)

    expect(chunks[0]?.startMs).toBe(0)
    expect(chunks.at(-1)?.endMs).toBe(REAL_EPISODE)

    for (let i = 1; i < chunks.length; i += 1) {
      expect(chunks[i]?.startMs).toBe(chunks[i - 1]?.endMs)
    }
  })

  // The property, not the count. Stitching walks these in order and adds
  // each offset in turn, so a gap or a repeat puts every later timestamp
  // somewhere else. The number of chunks moves whenever the target does;
  // that they run 0, 1, 2 … with nothing missing must not.
  it('numbers the chunks in order from zero, with no gaps', () => {
    const indexes = planChunks(REAL_EPISODE).map((chunk) => chunk.index)

    expect(indexes).toEqual(indexes.map((_, position) => position))
  })

  // The invariant the count was standing in for, and a better one: the
  // chunks tile the episode exactly. A gap loses audio, an overlap counts
  // it twice, and both look fine until someone reads the transcript.
  it('covers the whole episode exactly once', () => {
    const plan = planChunks(REAL_EPISODE)

    expect(plan[0]?.startMs).toBe(0)
    expect(plan.at(-1)?.endMs).toBe(REAL_EPISODE)
    for (const [position, chunk] of plan.entries()) {
      if (position > 0) expect(chunk.startMs).toBe(plan[position - 1]?.endMs)
    }
  })

  // The constraint that forced chunking back into the design: the free tier
  // spends its hourly allowance on seconds of audio, so no single request may
  // be longer than the whole hour's budget.
  it('keeps every chunk far inside the hourly allowance', () => {
    const HOURLY_ALLOWANCE_MS = 7_200_000

    for (const duration of [minutes(30), minutes(90), REAL_EPISODE, minutes(150)]) {
      for (const chunk of planChunks(duration)) {
        expect(chunk.endMs - chunk.startMs).toBeLessThan(HOURLY_ALLOWANCE_MS)
      }
    }
  })

  it('aims at the target length', () => {
    const chunks = planChunks(REAL_EPISODE)
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.endMs - chunk.startMs).toBe(CHUNK_TARGET_MS)
    }
  })

  // A 20-second final chunk is a whole round trip, a whole row and a whole
  // stitching seam for almost no audio.
  it('folds a tiny remainder into the previous chunk', () => {
    const chunks = planChunks(CHUNK_TARGET_MS * 2 + 5_000)

    expect(chunks).toHaveLength(2)
    expect(chunks.at(-1)?.endMs).toBe(CHUNK_TARGET_MS * 2 + 5_000)
  })

  it('keeps a remainder worth transcribing', () => {
    const chunks = planChunks(CHUNK_TARGET_MS * 2 + minutes(7))
    expect(chunks).toHaveLength(3)
  })

  it('refuses nothing to split', () => {
    expect(planChunks(0)).toEqual([])
    expect(planChunks(-1)).toEqual([])
  })

  it('is deterministic', () => {
    expect(planChunks(REAL_EPISODE)).toEqual(planChunks(REAL_EPISODE))
  })
})

const word = (text: string, startMs: number, endMs: number): TimedWord => ({
  text,
  startMs,
  endMs,
})

describe('stitchChunks', () => {
  it('shifts each chunk by where it began in the episode', () => {
    const stitched = stitchChunks([
      { index: 0, offsetMs: 0, words: [word('olá', 0, 400)] },
      { index: 1, offsetMs: 600_000, words: [word('galera', 0, 500)] },
    ])

    expect(stitched).toEqual([
      word('olá', 0, 400),
      word('galera', 600_000, 600_500),
    ])
  })

  it('orders by chunk index however they arrive', () => {
    const stitched = stitchChunks([
      { index: 2, offsetMs: 2_000, words: [word('três', 0, 10)] },
      { index: 0, offsetMs: 0, words: [word('um', 0, 10)] },
      { index: 1, offsetMs: 1_000, words: [word('dois', 0, 10)] },
    ])

    expect(stitched.map((w) => w.text)).toEqual(['um', 'dois', 'três'])
  })

  it('never goes backwards in time', () => {
    const stitched = stitchChunks(
      Array.from({ length: 7 }, (_, index) => ({
        index,
        offsetMs: index * CHUNK_TARGET_MS,
        words: [word(`w${index}a`, 0, 500), word(`w${index}b`, 1_000, 1_500)],
      })),
    )

    for (let i = 1; i < stitched.length; i += 1) {
      expect(stitched[i]?.startMs).toBeGreaterThanOrEqual(stitched[i - 1]?.startMs ?? 0)
    }
  })

  it('copes with a chunk that held no speech', () => {
    const stitched = stitchChunks([
      { index: 0, offsetMs: 0, words: [word('um', 0, 10)] },
      { index: 1, offsetMs: 1_000, words: [] },
      { index: 2, offsetMs: 2_000, words: [word('três', 0, 10)] },
    ])

    expect(stitched.map((w) => w.text)).toEqual(['um', 'três'])
  })

  it('returns nothing for nothing', () => {
    expect(stitchChunks([])).toEqual([])
  })

  // The guard both ADRs insisted on. Stitching fails *silently*: an off-by-one
  // in an offset leaves every count looking plausible while pointing at the
  // wrong moment in the audio. So the property is asserted directly — split a
  // known transcript up, stitch it back, and demand the original.
  it('round-trips any transcript it is given', () => {
    // The spacing is chosen so each case genuinely spans several chunks.
    // At a realistic 350 ms per word, 500 words is three minutes and sits
    // inside one chunk — the test would then pass without ever exercising an
    // offset, which is the only thing it exists to check.
    const cases: Array<[words: number, spacingMs: number]> = [
      [1, 350],
      [2, 350],
      [17, 350],
      [400, 350], // one chunk, the trivial case
      [400, 20_000], // ~2.2 hours: seven chunks
      [2_000, 4_000], // ~2.2 hours: seven chunks, dense
      [523, 3_000], // ~26 minutes: two chunks
    ]

    for (const [wordCount, spacing] of cases) {
      const original = Array.from({ length: wordCount }, (_, i) =>
        word(`p${i}`, i * spacing, i * spacing + 300),
      )
      const episodeMs = (original.at(-1)?.endMs ?? 0) + 1
      const plan = planChunks(Math.max(episodeMs, 1))

      // The case is only meaningful if it crossed a boundary.
      if (wordCount > 100 && spacing > 350) expect(plan.length).toBeGreaterThan(1)

      const chunks = plan.map((chunk) => ({
        index: chunk.index,
        offsetMs: chunk.startMs,
        words: original
          .filter((w) => w.startMs >= chunk.startMs && w.startMs < chunk.endMs)
          .map((w) => word(w.text, w.startMs - chunk.startMs, w.endMs - chunk.startMs)),
      }))

      expect(stitchChunks(chunks), `${wordCount} words @ ${spacing}ms`).toEqual(original)
    }
  })

  // Proves the round-trip test can actually fail. A single millisecond of
  // drift in one offset is the whole bug, and it leaves every number looking
  // entirely reasonable.
  it('would notice a one-millisecond drift in an offset', () => {
    const original = Array.from({ length: 400 }, (_, i) =>
      word(`p${i}`, i * 20_000, i * 20_000 + 300),
    )
    const plan = planChunks((original.at(-1)?.endMs ?? 0) + 1)
    expect(plan.length).toBeGreaterThan(1)

    const drifted = plan.map((chunk) => ({
      index: chunk.index,
      // One millisecond out on every chunk but the first.
      offsetMs: chunk.startMs + (chunk.index === 0 ? 0 : 1),
      words: original
        .filter((w) => w.startMs >= chunk.startMs && w.startMs < chunk.endMs)
        .map((w) => word(w.text, w.startMs - chunk.startMs, w.endMs - chunk.startMs)),
    }))

    expect(stitchChunks(drifted)).not.toEqual(original)
  })
})

describe('missingChunks', () => {
  // One failed chunk costs one chunk — but only if somebody notices. Counting
  // a partial episode as complete would under-report every number on the page
  // and look exactly like a finished episode.
  it('names the chunks that never came back', () => {
    const plan = planChunks(CHUNK_TARGET_MS * 3)
    const done = [0, 2].map((index) => ({ index, offsetMs: 0, words: [] }))

    expect(missingChunks(plan, done)).toEqual([1])
  })

  it('says nothing when the episode is complete', () => {
    const plan = planChunks(CHUNK_TARGET_MS * 3)
    const done = plan.map((c) => ({ index: c.index, offsetMs: c.startMs, words: [] }))

    expect(missingChunks(plan, done)).toEqual([])
  })

  it('ignores a result for a chunk nobody planned', () => {
    const plan = planChunks(CHUNK_TARGET_MS)
    expect(missingChunks(plan, [
      { index: 0, offsetMs: 0, words: [] },
      { index: 99, offsetMs: 0, words: [] },
    ])).toEqual([])
  })
})

// US-043 · ADR 0020
describe('SINGLE_CHUNK_LIMIT_MS', () => {
  it('is the longest episode that plans to one chunk', () => {
    expect(planChunks(SINGLE_CHUNK_LIMIT_MS)).toHaveLength(1)
    expect(planChunks(SINGLE_CHUNK_LIMIT_MS + 1)).toHaveLength(2)
  })

  // Until the browser can split audio, a longer file cannot be handled at
  // all: the whole of it would be sent as every chunk, transcribing the
  // episode once per chunk and spending the day's allowance several times
  // over for a transcript that repeats itself.
  it('is well inside the hourly balance, so one chunk is never refused for its length', () => {
    expect(SINGLE_CHUNK_LIMIT_MS).toBeLessThan(HOURLY_ALLOWANCE_MS)
  })

  it("is shorter than one of this show's episodes, which is why splitting is M1's job", () => {
    expect(SINGLE_CHUNK_LIMIT_MS).toBeLessThan(100 * 60_000)
  })
})

// US-046 · ADR 0020
describe('planFromTranscripts', () => {
  const at = (index: number, offsetMs: number): ChunkTranscript => ({ index, offsetMs, words: [] })

  /*
   * How an episode was actually split is a matter of record, not of
   * recomputation. `planChunks` answers "how should this be split", which is
   * a different question and gives a different answer the moment the target
   * size changes — as it did, from twenty minutes to twelve. Re-deriving the
   * plan for an already-finished episode then invents chunks nobody ever
   * uploaded, and asking storage for one fails.
   */
  it('reads the plan back off the chunks that exist', () => {
    const plan = planFromTranscripts([at(0, 0), at(1, 1_200_000)], 1_500_000)

    expect(plan).toEqual([
      { index: 0, startMs: 0, endMs: 1_200_000 },
      { index: 1, startMs: 1_200_000, endMs: 1_500_000 },
    ])
  })

  it('does not care what the current target size is', () => {
    // One chunk covering twenty minutes, from when that was the target.
    const plan = planFromTranscripts([at(0, 0)], 1_200_000)

    expect(plan).toHaveLength(1)
    expect(plan[0]?.endMs).toBe(1_200_000)
  })

  it('puts them in order however they come back', () => {
    const plan = planFromTranscripts([at(2, 1_440_000), at(0, 0), at(1, 720_000)], 2_000_000)

    expect(plan.map((chunk) => chunk.index)).toEqual([0, 1, 2])
    expect(plan.map((chunk) => chunk.startMs)).toEqual([0, 720_000, 1_440_000])
  })

  it('tiles the episode with no gaps', () => {
    const plan = planFromTranscripts([at(0, 0), at(1, 720_000), at(2, 1_440_000)], 2_000_000)

    for (const [position, chunk] of plan.entries()) {
      if (position > 0) expect(chunk.startMs).toBe(plan[position - 1]?.endMs)
    }
    expect(plan.at(-1)?.endMs).toBe(2_000_000)
  })

  it('has no plan for an episode with no chunks stored', () => {
    expect(planFromTranscripts([], 1_000_000)).toEqual([])
  })

  // A duration shorter than the last offset would make an end before its
  // start, and a negative-length chunk is worse than a wrong one.
  it('never ends a chunk before it began', () => {
    const plan = planFromTranscripts([at(0, 0), at(1, 900_000)], 500_000)

    for (const chunk of plan) expect(chunk.endMs).toBeGreaterThanOrEqual(chunk.startMs)
  })
})
