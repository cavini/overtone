// US-002, US-003, US-008 · the pipeline's status transitions and failures
import { describe, expect, it, vi } from 'vitest'
import type { EpisodeStatus } from '../domain/episode.js'
import type { Topic } from '../domain/topic.js'
import type { EpisodeStore, StoredAnalysis } from '../ports/episode-store.js'
import { FakeTranscriptionProvider } from '../testing/fake-transcription-provider.js'
import { processEpisode } from './process-episode.js'

const EPISODE = 'ep-12'
const AUDIO = 'audio://episode-12'
const SPOKEN = 'hoje falamos do pirão e do hotdog'

/** Records the order of everything, because the order is the contract. */
const recordingStore = () => {
  const statuses: EpisodeStatus[] = []
  const saved: StoredAnalysis[] = []
  const failures: unknown[] = []
  const order: string[] = []

  const store: EpisodeStore = {
    setStatus: (_id, status, failure) => {
      statuses.push(status)
      order.push(`status:${status}`)
      if (failure !== undefined) failures.push(failure)
      return Promise.resolve()
    },
    save: (_id, analysis) => {
      saved.push(analysis)
      order.push('save')
      return Promise.resolve()
    },
  }

  return { store, statuses, saved, failures, order }
}

const lemmas = { lookup: () => Promise.resolve(new Map<string, string>()) }

const run = (
  overrides: {
    audio?: string
    text?: string
    topics?: readonly Topic[]
    store?: EpisodeStore
  } = {},
) => {
  const recorded = recordingStore()
  const store = overrides.store ?? recorded.store
  return {
    recorded,
    outcome: processEpisode(
      {
        episodeId: EPISODE,
        audioUrl: overrides.audio ?? AUDIO,
        topics: overrides.topics ?? [],
      },
      {
        transcription: FakeTranscriptionProvider.withText(AUDIO, overrides.text ?? SPOKEN),
        lemmas,
        store,
      },
    ),
  }
}

describe('processEpisode', () => {
  describe('when everything works', () => {
    it('reports success', async () => {
      const { outcome } = run()
      expect((await outcome).ok).toBe(true)
    })

    // The user is watching a spinner. Each status is a different sentence on
    // screen, so skipping one means the page lies about where it got to.
    it('walks the statuses in order', async () => {
      const { recorded, outcome } = run()
      await outcome
      expect(recorded.statuses).toEqual(['transcribing', 'analyzing', 'ready'])
    })

    // `ready` means the numbers are there. Setting it before the write would
    // show an empty page that claims to be finished.
    it('never says ready before the analysis is stored', async () => {
      const { recorded, outcome } = run()
      await outcome
      expect(recorded.order).toEqual([
        'status:transcribing',
        'status:analyzing',
        'save',
        'status:ready',
      ])
    })

    it('stores the transcript, its words and the counts together', async () => {
      const { recorded, outcome } = run()
      await outcome

      const [analysis] = recorded.saved
      expect(analysis?.transcript.fullText).toBe(SPOKEN)
      expect(analysis?.segments.length).toBeGreaterThan(0)
      expect(analysis?.termCounts.length).toBeGreaterThan(0)
      expect(analysis?.insight.totalTokens).toBe(7)
    })

    it('keeps the provider payload so analysis can be re-run for free', async () => {
      const { recorded, outcome } = run()
      await outcome

      const stored = recorded.saved[0]?.transcript
      expect(stored?.rawProviderPayload).toBeDefined()
      expect(stored?.provider).toBe('fake')
      expect(stored?.providerModel).toBe('fixture')
    })

    it('stores a mention for every running joke it found', async () => {
      const topic: Topic = { id: 't-1', name: 'Hotdog', patterns: ['hotdog'] }
      const { recorded, outcome } = run({ topics: [topic] })
      await outcome

      expect(recorded.saved[0]?.mentions).toEqual([
        expect.objectContaining({ topicId: 't-1', matchedText: 'hotdog' }),
      ])
    })

    it('records the versions that produced the numbers', async () => {
      const { recorded, outcome } = run()
      await outcome
      expect(recorded.saved[0]?.insight.pipelineVersion).toBeGreaterThan(0)
    })
  })

  describe('when transcription fails', () => {
    it('marks the episode failed and says why', async () => {
      const { recorded, outcome } = run({ audio: 'audio://missing' })
      const result = await outcome

      expect(result.ok).toBe(false)
      expect(recorded.statuses).toEqual(['transcribing', 'failed'])
      expect(recorded.failures).toEqual([{ code: 'AUDIO_NOT_FOUND' }])
    })

    // A code and its data, never a sentence: nothing down here knows which
    // language the reader wants.
    it('stores a code rather than a message', async () => {
      const { recorded, outcome } = run({ audio: 'audio://missing' })
      await outcome
      expect(JSON.stringify(recorded.failures)).not.toMatch(/[a-z] [a-z]+ [a-z]/i)
    })

    it('saves nothing', async () => {
      const { recorded, outcome } = run({ audio: 'audio://missing' })
      await outcome
      expect(recorded.saved).toEqual([])
      expect(recorded.order).not.toContain('save')
    })

    it('does not look a dictionary up for a transcript it never got', async () => {
      const lookup = vi.fn(() => Promise.resolve(new Map<string, string>()))
      await processEpisode(
        { episodeId: EPISODE, audioUrl: 'audio://missing', topics: [] },
        {
          transcription: FakeTranscriptionProvider.withText(AUDIO, SPOKEN),
          lemmas: { lookup },
          store: recordingStore().store,
        },
      )
      expect(lookup).not.toHaveBeenCalled()
    })
  })

  describe('when storing fails', () => {
    // The worst outcome would be an episode marked ready with nothing behind
    // it: a page that looks finished and shows zero of everything.
    it('leaves the episode failed rather than falsely ready', async () => {
      const statuses: EpisodeStatus[] = []
      const store: EpisodeStore = {
        setStatus: (_id, status) => {
          statuses.push(status)
          return Promise.resolve()
        },
        save: () => Promise.reject(new Error('connection lost')),
      }

      const result = await processEpisode(
        { episodeId: EPISODE, audioUrl: AUDIO, topics: [] },
        {
          transcription: FakeTranscriptionProvider.withText(AUDIO, SPOKEN),
          lemmas,
          store,
        },
      )

      expect(result.ok).toBe(false)
      expect(statuses).toEqual(['transcribing', 'analyzing', 'failed'])
      expect(statuses).not.toContain('ready')
    })

    it('reports the failure as a code', async () => {
      const failures: unknown[] = []
      const store: EpisodeStore = {
        setStatus: (_id, _status, failure) => {
          if (failure !== undefined) failures.push(failure)
          return Promise.resolve()
        },
        save: () => Promise.reject(new Error('connection lost')),
      }

      await processEpisode(
        { episodeId: EPISODE, audioUrl: AUDIO, topics: [] },
        {
          transcription: FakeTranscriptionProvider.withText(AUDIO, SPOKEN),
          lemmas,
          store,
        },
      )

      expect(failures).toEqual([{ code: 'ANALYSIS_NOT_STORED' }])
    })
  })

  it('finds no speech in silence and still finishes cleanly', async () => {
    const { recorded, outcome } = run({ text: '' })
    const result = await outcome

    expect(result.ok).toBe(true)
    expect(recorded.statuses).toEqual(['transcribing', 'analyzing', 'ready'])
    expect(recorded.saved[0]?.insight.totalTokens).toBe(0)
  })
})
