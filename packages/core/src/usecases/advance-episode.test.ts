// US-002, US-040, US-043 · ADR 0020
//
// One step of the paced pipeline. An episode of this show is longer than the
// hourly allowance, so transcription spans hours and process lifetimes — this
// does as much as it is allowed to and reports what happens next.
import { describe, expect, it, vi } from 'vitest'
import { CHUNK_TARGET_MS, DAILY_ALLOWANCE_MS, HOURLY_ALLOWANCE_MS } from '../analysis/index.js'
import { ALLOWANCE_REFILL_RATE } from '../domain/observed-allowance.js'
import type { AllowanceState } from '../domain/allowance.js'
import type { ObservedAllowance } from '../domain/observed-allowance.js'
import type { ChunkTranscript } from '../domain/audio-chunk.js'
import type { EpisodeStatus } from '../domain/episode.js'
import type { Topic } from '../domain/topic.js'
import type { EpisodeFailure, StoredAnalysis } from '../ports/episode-store.js'
import { transcriptFromText } from '../testing/fake-transcription-provider.js'
import { advanceEpisode, type UploadedChunk } from './advance-episode.js'

const EPISODE = 'ep-202'
const NOW = 1_800_000_000_000

/** Three chunks is enough to exercise ordering without being unwieldy. */
const chunks: UploadedChunk[] = [0, 1, 2].map((index) => ({
  index,
  startMs: index * CHUNK_TARGET_MS,
  endMs: (index + 1) * CHUNK_TARGET_MS,
  audioUrl: `audio://chunk-${index}`,
}))

const SPOKEN = ['hoje falamos do pirão', 'o hotdog é melhor', 'ninguém concorda comigo']

const harness = (
  options: {
    transcribed?: readonly number[]
    allowance?: Partial<AllowanceState>
    failTranscription?: boolean
    observed?: ObservedAllowance
  } = {},
) => {
  const stored = new Map<number, ChunkTranscript>()
  for (const index of options.transcribed ?? []) {
    stored.set(index, {
      index,
      offsetMs: index * CHUNK_TARGET_MS,
      words: transcriptFromText(SPOKEN[index] ?? 'olá').words,
    })
  }

  const statuses: EpisodeStatus[] = []
  const failures: EpisodeFailure[] = []
  const saved: StoredAnalysis[] = []
  const recorded: number[] = []
  const observations: Array<ObservedAllowance | undefined> = []
  const order: string[] = []

  const transcribe = vi.fn((request: { audioUrl: string }) => {
    if (options.failTranscription === true) {
      return Promise.resolve({ ok: false as const, failure: { code: 'PROVIDER_UNAVAILABLE' as const } })
    }
    const index = Number(request.audioUrl.split('-').at(-1))
    return Promise.resolve({
      ok: true as const,
      ...(options.observed === undefined ? {} : { observedAllowance: options.observed }),
      transcript: {
        ...transcriptFromText(SPOKEN[index] ?? 'olá'),
        provider: 'groq',
        providerModel: 'whisper-large-v3-turbo',
      },
    })
  })

  return {
    transcribe,
    observations,
    statuses,
    failures,
    saved,
    recorded,
    order,
    stored,
    deps: {
      transcription: { transcribe },
      lemmas: {
        lookup: () => Promise.resolve(new Map<string, string>()),
        // Nothing known as a verb form. With no dictionary entries either,
        // every token keeps its own spelling, which is what these tests
        // assert on.
        verbForms: () => Promise.resolve(new Set<string>()),
      },
      clock: { now: () => NOW },
      chunks: {
        transcribedIndexes: () => Promise.resolve([...stored.keys()]),
        transcripts: () => Promise.resolve([...stored.values()]),
        transcript: (_id: string, index: number) => Promise.resolve(stored.get(index)),
        save: (_id: string, chunk: ChunkTranscript) => {
          stored.set(chunk.index, chunk)
          order.push(`save-chunk-${chunk.index}`)
          return Promise.resolve()
        },
      },
      allowance: {
        read: () =>
          Promise.resolve({
            remainingAudioMs: HOURLY_ALLOWANCE_MS,
            asOfMs: NOW,
            dailyUsedMs: 0,
            dayResetsAt: NOW + 86_400_000,
            ...options.allowance,
          }),
        record: (ms: number, observed?: ObservedAllowance) => {
          recorded.push(ms)
          observations.push(observed)
          order.push('record-allowance')
          return Promise.resolve()
        },
      },
      store: {
        setStatus: (_id: string, status: EpisodeStatus, failure?: EpisodeFailure) => {
          statuses.push(status)
          order.push(`status-${status}`)
          if (failure !== undefined) failures.push(failure)
          return Promise.resolve()
        },
        save: (_id: string, analysis: StoredAnalysis) => {
          saved.push(analysis)
          order.push('save-analysis')
          return Promise.resolve()
        },
      },
    },
  }
}

const advance = (h: ReturnType<typeof harness>, topics: readonly Topic[] = []) =>
  advanceEpisode({ episodeId: EPISODE, chunks, topics }, h.deps)

describe('advanceEpisode', () => {
  describe('working through the chunks', () => {
    it('transcribes the first chunk when nothing has been done', async () => {
      const h = harness()
      const outcome = await advance(h)

      expect(outcome).toEqual({ state: 'transcribed', chunkIndex: 0, remaining: 2 })
      expect(h.transcribe).toHaveBeenCalledOnce()
    })

    it('picks up where it left off', async () => {
      const h = harness({ transcribed: [0, 1] })
      expect(await advance(h)).toEqual({ state: 'transcribed', chunkIndex: 2, remaining: 0 })
    })

    it('always asks for Portuguese', async () => {
      const h = harness()
      await advance(h)
      expect(h.transcribe).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'pt' }),
      )
    })

    // Chunks are paid for in allowance that is capped at three episodes a
    // day. Storing the transcript before recording the spend means a crash
    // between the two costs an under-count, not work already paid for.
    it('stores the transcript before recording what it cost', async () => {
      const h = harness()
      await advance(h)
      expect(h.order).toEqual(['status-transcribing', 'save-chunk-0', 'record-allowance'])
    })

    it('records the chunk duration, not the words', async () => {
      const h = harness()
      await advance(h)
      expect(h.recorded).toEqual([CHUNK_TARGET_MS])
    })

    it('keeps the chunk offset so stitching can use it', async () => {
      const h = harness({ transcribed: [0] })
      await advance(h)
      expect(h.stored.get(1)?.offsetMs).toBe(CHUNK_TARGET_MS)
    })

    /*
     * Each chunk is sent on its own, so without this every one after the
     * first begins mid-conversation knowing nothing about it. Measured on a
     * real episode: the same chunk transcribed cold lost a clause that the
     * prompted run recovered.
     */
    /*
     * This was a hard-coded string for months, so every episode claimed
     * `whisper-large-v3-turbo` whatever had really run — including after
     * the switch to the full model. Tracing a count back to what produced
     * it is the only thing the field is for.
     */
    it('records which model actually produced the chunk', async () => {
      const h = harness()
      await advance(h)

      expect(h.stored.get(0)?.providerModel).toBe('whisper-large-v3-turbo')
    })

    it('tells the transcriber what the chunk before it said', async () => {
      const h = harness({ transcribed: [0] })
      await advance(h)

      expect(h.transcribe.mock.calls[0]?.[0]).toMatchObject({
        precedingText: expect.stringContaining(SPOKEN[0] ?? ''),
      })
    })

    // Nothing came before it, and a blank prompt is still a prompt — it
    // tells the model the thing it is continuing had no words in it.
    it('sends nothing before the first chunk of an episode', async () => {
      const h = harness()
      await advance(h)

      expect(h.transcribe.mock.calls[0]?.[0]).not.toHaveProperty('precedingText')
    })
  })

  describe('waiting on the allowance', () => {
    it('holds when the hour is spent, and stays in transcribing', async () => {
      const h = harness({ allowance: { remainingAudioMs: 0 } })
      const outcome = await advance(h)

      expect(outcome).toMatchObject({
        state: 'waiting',
        reason: 'HOURLY_ALLOWANCE_EXHAUSTED',
      })
      expect(h.statuses).toEqual(['transcribing'])
      expect(h.transcribe).not.toHaveBeenCalled()
    })

    it('says how long to wait', async () => {
      // One chunk against an empty bucket is exactly that chunk's worth of
      // refill — minutes, not an hour of waiting for a window to turn
      // (ADR 0021). Derived from the chunk size rather than written down,
      // because the number moves whenever the chunk does and the
      // relationship is what matters.
      const h = harness({ allowance: { remainingAudioMs: 0 } })
      const outcome = await advance(h)

      expect(outcome).toMatchObject({
        retryAfterMs: CHUNK_TARGET_MS / ALLOWANCE_REFILL_RATE,
      })
    })

    it('reports the day when the day is what is spent', async () => {
      const h = harness({ allowance: { dailyUsedMs: DAILY_ALLOWANCE_MS } })
      expect(await advance(h)).toMatchObject({ reason: 'DAILY_ALLOWANCE_EXHAUSTED' })
    })

    // Waiting is a normal state of this system, not a failure. Marking the
    // episode failed would make a routine pause look like something broke.
    it('never marks the episode failed for waiting', async () => {
      const h = harness({ allowance: { dailyUsedMs: DAILY_ALLOWANCE_MS } })
      await advance(h)
      expect(h.statuses).not.toContain('failed')
      expect(h.failures).toEqual([])
    })
  })

  describe('finishing', () => {
    it('analyses and stores once every chunk is in', async () => {
      const h = harness({ transcribed: [0, 1, 2] })
      const outcome = await advance(h)

      expect(outcome).toEqual({ state: 'ready' })
      expect(h.saved).toHaveLength(1)
      expect(h.transcribe).not.toHaveBeenCalled()
    })

    it('stitches the chunks into one transcript', async () => {
      const h = harness({ transcribed: [0, 1, 2] })
      await advance(h)

      const analysis = h.saved[0]
      expect(analysis?.insight.totalTokens).toBeGreaterThan(8)

      // The whole point of stitching: the third chunk's words have been moved
      // to where they were actually said, two chunks into the episode. Without
      // the offsets they would all sit near zero and every timestamp on the
      // page would point at the opening minute.
      expect(analysis?.insight.durationMs).toBeGreaterThanOrEqual(CHUNK_TARGET_MS * 2)
      expect(analysis?.segments.at(-1)?.endMs).toBeGreaterThanOrEqual(CHUNK_TARGET_MS * 2)
    })

    // Three short unpunctuated chunks become one segment, which is correct —
    // segmentation breaks on sentence ends, and there are none.
    it('does not invent segment breaks at the chunk joins', async () => {
      const h = harness({ transcribed: [0, 1, 2] })
      await advance(h)
      expect(h.saved[0]?.segments).toHaveLength(1)
    })

    it('never says ready before the analysis is stored', async () => {
      const h = harness({ transcribed: [0, 1, 2] })
      await advance(h)
      expect(h.order).toEqual(['status-analyzing', 'save-analysis', 'status-ready'])
    })

    it('counts a running joke across the chunk boundaries', async () => {
      const h = harness({ transcribed: [0, 1, 2] })
      const topic: Topic = { id: 't-1', name: 'Hotdog', patterns: ['hotdog'] }
      await advance(h, [topic])

      expect(h.saved[0]?.mentions).toEqual([
        expect.objectContaining({ topicId: 't-1', matchedText: 'hotdog' }),
      ])
    })
  })

  describe('when a chunk fails', () => {
    it('marks the episode failed with a code', async () => {
      const h = harness({ failTranscription: true })
      const outcome = await advance(h)

      expect(outcome).toMatchObject({
        state: 'failed',
        failure: { code: 'PROVIDER_UNAVAILABLE' },
      })
      expect(h.statuses).toEqual(['transcribing', 'failed'])
    })

    it('keeps the chunks that did come back', async () => {
      const h = harness({ transcribed: [0], failTranscription: true })
      await advance(h)
      expect(h.stored.has(0)).toBe(true)
    })

    it('does not spend allowance on a chunk it never got', async () => {
      const h = harness({ failTranscription: true })
      await advance(h)
      expect(h.recorded).toEqual([])
    })
  })

  // ADR 0021. The provider reports its own balance on every response, which
  // is ground truth about a number we otherwise only estimate.
  describe('what the provider said about the allowance', () => {
    const OBSERVED = {
      remainingAudioMs: 5_473_000,
      limitAudioMs: HOURLY_ALLOWANCE_MS,
      refillsFullyInMs: 863_500,
    }

    it('is handed to the store along with the spend', async () => {
      const h = harness({ observed: OBSERVED })
      await advance(h)

      expect(h.observations).toEqual([OBSERVED])
    })

    // Absent headers must reach the store as absent, so it falls back to its
    // own arithmetic rather than recording a balance nobody reported.
    it('is absent when the provider said nothing', async () => {
      const h = harness()
      await advance(h)

      expect(h.observations).toEqual([undefined])
    })
  })

  it('finds nothing to do for an episode with no chunks', async () => {
    const h = harness()
    const outcome = await advanceEpisode(
      { episodeId: EPISODE, chunks: [], topics: [] },
      h.deps,
    )
    expect(outcome).toEqual({ state: 'ready' })
  })
})
