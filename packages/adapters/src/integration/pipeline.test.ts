// The whole pipeline on real Brazilian Portuguese, with the real dictionary.
//
// Everything below the browser: chunks in, counted terms and located running
// jokes out. The transcription service is faked — the free allowance is shared
// across every user of the app, so a test suite that spent it would take the
// product down — but the Portuguese, the lemmas and the counting are all real.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  advanceEpisode,
  type AdvanceEpisodeOutcome,
  type StoredAnalysis,
  type Topic,
  type UploadedChunk,
} from '@overtone/core'
import {
  FakeAllowanceStore,
  FakeChunkStore,
  FakeEpisodeStore,
  FixedClock,
  transcriptFromText,
} from '@overtone/core/testing'
import { beforeAll, describe, expect, it } from 'vitest'
import { parseLemmaList } from '../lemmas/parse-lemma-list.js'
import { QueryingLemmaRepository } from '../lemmas/querying-lemma-repository.js'

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../fixtures')

const EPISODE = 'episode-12'

const HOTDOG: Topic = { id: 'topic-hotdog', name: 'Hotdog', patterns: ['hotdog'] }
const PIRAO: Topic = { id: 'topic-pirao', name: 'Pirão', patterns: ['pirão'] }
const GRAVACAO: Topic = { id: 'topic-gravacao', name: 'Gravação', patterns: ['gravação'] }

let analysis: StoredAnalysis
let outcome: AdvanceEpisodeOutcome
let statuses: readonly string[]

beforeAll(async () => {
  const dictionary = new Map(
    parseLemmaList(readFileSync(`${fixtures}/lemmas-sample.tsv`, 'utf8')),
  )
  const spoken = readFileSync(`${fixtures}/episode-transcript.txt`, 'utf8')
  const transcript = transcriptFromText(spoken)

  // One chunk: the fixture is short, and chunk count is not what this test is
  // about. The chunk-boundary arithmetic has its own property test.
  const chunks: UploadedChunk[] = [
    { index: 0, startMs: 0, endMs: transcript.durationMs, audioUrl: 'audio://chunk-0' },
  ]

  const clock = new FixedClock()
  const store = new FakeEpisodeStore()
  const chunkStore = new FakeChunkStore()

  const deps = {
    transcription: {
      transcribe: () =>
        Promise.resolve({
          ok: true as const,
          transcript: { ...transcript, provider: 'fake', providerModel: 'fixture' },
        }),
    },
    lemmas: new QueryingLemmaRepository((forms) =>
      Promise.resolve(
        forms.flatMap((form) => {
          const lemma = dictionary.get(form)
          return lemma === undefined ? [] : [{ form, lemma }]
        }),
      ),
    ),
    chunks: chunkStore,
    allowance: FakeAllowanceStore.fresh(clock.now()),
    store,
    clock,
  }

  const request = { episodeId: EPISODE, chunks, topics: [HOTDOG, PIRAO, GRAVACAO] }

  // Step until it settles, the way a scheduled poke would.
  let step = await advanceEpisode(request, deps)
  for (let guard = 0; step.state === 'transcribed' && guard < 10; guard += 1) {
    step = await advanceEpisode(request, deps)
  }

  outcome = step
  statuses = store.statuses
  const stored = store.latest
  if (stored === undefined) throw new Error('nothing was stored')
  analysis = stored
})

const term = (name: string) => analysis.termCounts.find((t) => t.term === name)
const mentionsOf = (topic: Topic) =>
  analysis.mentions.filter((m) => m.topicId === topic.id)

describe('the pipeline, end to end', () => {
  it('reaches ready', () => {
    expect(outcome).toEqual({ state: 'ready' })
    expect(statuses.at(-1)).toBe('ready')
  })

  it('walks the statuses in order', () => {
    expect(statuses).toEqual(['transcribing', 'analyzing', 'ready'])
  })

  // The payoff of the dictionary. Five spellings of one verb, one term.
  it('folds every form of falar into one term', () => {
    expect(term('falar')).toMatchObject({ count: 8, heuristic: false })
    expect(term('falar')?.surfaceForms).toEqual([
      'fala', 'falando', 'falar', 'falei', 'falou',
    ])
  })

  it('groups a plural noun through the dictionary', () => {
    expect(term('gravação')).toMatchObject({ count: 2, heuristic: false })
  })

  it('leaves out stop words', () => {
    const listed = analysis.termCounts.map((t) => t.term)
    for (const stopWord of ['o', 'a', 'de', 'que', 'ele', 'é', 'no']) {
      expect(listed).not.toContain(stopWord)
    }
  })

  // These counts are the joke, so they stay countable rather than being
  // filtered away as noise.
  it('counts the discourse markers a podcast finds funny', () => {
    expect(term('tipo')?.count).toBe(2)
    expect(term('né')?.count).toBe(1)
  })

  it('never merges two words that differ by an accent', () => {
    const listed = analysis.termCounts.map((t) => t.term)
    expect(listed).toContain('mês')
    expect(listed).not.toContain('mes')
  })

  describe('running jokes', () => {
    it('counts hotdog across every spelling it was written in', () => {
      expect(mentionsOf(HOTDOG).map((m) => m.matchedText)).toEqual([
        'hotdog', 'hotdog', 'hot dog', 'hot-dog',
      ])
    })

    it('counts a one-word joke', () => {
      expect(mentionsOf(PIRAO)).toHaveLength(2)
    })

    it('finds a joke through its inflection', () => {
      expect(mentionsOf(GRAVACAO).map((m) => m.matchedText)).toEqual([
        'gravações', 'gravações',
      ])
    })

    // Every mention is playable. This is what makes a count arguable instead
    // of something to be taken on faith.
    it('locates every mention in the audio, in order', () => {
      const found = mentionsOf(HOTDOG)
      expect(found).not.toHaveLength(0)

      for (const mention of found) {
        expect(mention.endMs).toBeGreaterThan(mention.startMs)
        expect(mention.endMs).toBeLessThanOrEqual(analysis.insight.durationMs)
      }

      const starts = found.map((m) => m.startMs)
      expect([...starts].sort((a, b) => a - b)).toEqual(starts)
    })
  })

  it('conserves every token across the three classes', () => {
    const { wordTokens, stopWordTokens, fillerTokens, totalTokens } = analysis.insight
    expect(wordTokens + stopWordTokens + fillerTokens).toBe(totalTokens)
  })

  it('records the versions that produced these numbers', () => {
    expect(analysis.insight.pipelineVersion).toBeGreaterThan(0)
    expect(analysis.transcript.vocabularyVersion).toBeGreaterThan(0)
  })

  it('keeps the provider payload so analysis can be re-run for free', () => {
    expect(analysis.transcript.rawProviderPayload).toBeDefined()
  })
})
