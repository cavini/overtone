// US-042 · ADR 0017
import type { EpisodeAnalysis } from '@overtone/core'
import { describe, expect, it } from 'vitest'
import { presentAnalysis, presentOutcome, timestamp } from './episode-view.js'

const ANALYSIS: EpisodeAnalysis = {
  durationMs: 7_591_000,
  totalTokens: 21_480,
  wordTokens: 9_312,
  stopWordTokens: 11_200,
  fillerTokens: 968,
  uniqueTerms: 2_145,
  wordsPerMinute: 180,
  fillersPerMinute: 8,
  topTerms: [
    { term: 'querer', count: 1_234, surfaceForms: ['quer', 'queria', 'quero'], heuristic: false },
    { term: 'garrafa', count: 21, surfaceForms: ['garrafinha'], heuristic: true },
  ],
  topics: [
    {
      topicId: 't1',
      topicName: 'Feijão',
      count: 2,
      mentions: [
        { matchedText: 'feijão', startMs: 65_000, endMs: 65_400 },
        { matchedText: 'feijão', startMs: 3_725_000, endMs: 3_725_500 },
      ],
    },
  ],
  pipelineVersion: 1,
  vocabularyVersion: 1,
}

describe('presentAnalysis', () => {
  // pt-BR writes 1.234, English writes 1,234. The entire output of this
  // product is numbers, so a separator in the wrong place is a defect.
  it('formats numbers the way the language writes them', () => {
    expect(presentAnalysis(ANALYSIS, 'pt').terms[0]?.count).toBe('1.234')
    expect(presentAnalysis(ANALYSIS, 'en').terms[0]?.count).toBe('1,234')
  })

  // The audio is always pt-BR and the pipeline always runs in Portuguese
  // (ADR 0014). Reading the page in English must change the words around the
  // numbers and never a number itself.
  it('counts the same in both languages', () => {
    const pt = presentAnalysis(ANALYSIS, 'pt')
    const en = presentAnalysis(ANALYSIS, 'en')

    expect(pt.terms.map((t) => t.term)).toEqual(en.terms.map((t) => t.term))
    expect(pt.topics.map((t) => t.rawCount)).toEqual(en.topics.map((t) => t.rawCount))
  })

  it('lists the forms that were folded together', () => {
    expect(presentAnalysis(ANALYSIS, 'pt').terms[0]?.forms).toBe('quer / queria / quero')
  })

  // One form is just the word again. Showing it implies a grouping happened
  // when none did.
  it('says nothing about forms when there was only one', () => {
    expect(presentAnalysis(ANALYSIS, 'pt').terms[1]?.forms).toBe('')
  })

  // A stemmed grouping can over-merge — `comer` stems to `com`, folding a
  // verb into a preposition. A merge the reader can see is one they can
  // correct, so it is labelled rather than hidden.
  it('marks a grouping the stemmer guessed at, and says so in the right language', () => {
    const pt = presentAnalysis(ANALYSIS, 'pt').terms[1]
    const en = presentAnalysis(ANALYSIS, 'en').terms[1]

    expect(pt?.heuristic).toBe(true)
    expect(pt?.heuristicNotice).toContain('garrafa')
    expect(pt?.heuristicNotice).not.toBe(en?.heuristicNotice)
  })

  it('leaves a dictionary grouping unmarked', () => {
    const term = presentAnalysis(ANALYSIS, 'pt').terms[0]

    expect(term?.heuristic).toBe(false)
    expect(term?.heuristicNotice).toBeUndefined()
  })

  it('puts each running joke with the moments it was said', () => {
    const [joke] = presentAnalysis(ANALYSIS, 'pt').topics

    expect(joke?.name).toBe('Feijão')
    expect(joke?.count).toBe('2')
    expect(joke?.moments).toEqual([
      { at: '01:05', quote: 'feijão', startMs: 65_000 },
      { at: '1:02:05', quote: 'feijão', startMs: 3_725_000 },
    ])
  })

  it('reports the episode length as a duration, not a count', () => {
    expect(presentAnalysis(ANALYSIS, 'pt').durationLabel).toBe('2:06:31')
  })

  it('carries the figures the page summarises', () => {
    const view = presentAnalysis(ANALYSIS, 'en')

    expect(view.stats).toMatchObject({
      totalWords: '21,480',
      countableWords: '9,312',
      uniqueTerms: '2,145',
      wordsPerMinute: '180',
      fillersPerMinute: '8',
    })
  })

  it('copes with an episode where nothing was said', () => {
    const silent = { ...ANALYSIS, topTerms: [], topics: [], totalTokens: 0, wordTokens: 0 }

    const view = presentAnalysis(silent, 'pt')

    expect(view.terms).toEqual([])
    expect(view.topics).toEqual([])
    expect(view.stats.totalWords).toBe('0')
  })
})

describe('presentOutcome', () => {
  it('names the status in the reader’s language', () => {
    expect(presentOutcome({ state: 'ready' }, 'pt').statusLabel).toBe('Pronto')
    expect(presentOutcome({ state: 'ready' }, 'en').statusLabel).toBe('Ready')
  })

  // Waiting is a normal state of this system, not an error (ADR 0020), so it
  // reads as progress and says when to come back.
  it('explains a wait on the hourly allowance, in minutes', () => {
    const view = presentOutcome(
      { state: 'waiting', reason: 'HOURLY_ALLOWANCE_EXHAUSTED', retryAfterMs: 195_500 },
      'en',
    )

    expect(view.statusLabel).toBe('Transcribing')
    expect(view.notice).toContain('4 minutes')
  })

  // Telling someone to come back in minutes when the real answer is tomorrow
  // is worse than telling them nothing.
  it('explains a wait on the daily allowance in hours', () => {
    const view = presentOutcome(
      { state: 'waiting', reason: 'DAILY_ALLOWANCE_EXHAUSTED', retryAfterMs: 7 * 3_600_000 },
      'en',
    )

    expect(view.notice).toContain('7 hours')
  })

  it('reports a chunk still going as progress', () => {
    const view = presentOutcome({ state: 'transcribed', chunkIndex: 2, remaining: 4 }, 'en')

    expect(view.statusLabel).toBe('Transcribing')
    expect(view.notice).toContain('3')
    expect(view.notice).toContain('7')
  })

  // Every way the pipeline can stop has to come out as something a person
  // can read, in their language. A code with no mapping would reach the page
  // as a bare identifier.
  describe('each failure the pipeline can report', () => {
    const FAILURES = [
      { code: 'AUDIO_UNREADABLE' },
      { code: 'AUDIO_NOT_FOUND' },
      { code: 'PROVIDER_UNAVAILABLE' },
      { code: 'PROVIDER_RESPONSE_INVALID' },
      { code: 'ALLOWANCE_EXHAUSTED', retryAfterMs: 195_500 },
      { code: 'ANALYSIS_NOT_STORED' },
    ] as const

    it.each(FAILURES)('says something readable about $code', (failure) => {
      const view = presentOutcome({ state: 'failed', failure }, 'en', {
        filename: 'ep-12.m4a',
        chunkCount: 7,
      })

      expect(view.statusLabel).toBe('Failed')
      expect(view.notice).toBeTruthy()
      // A code that fell through to itself, rather than being translated.
      expect(view.notice).not.toBe(failure.code)
      expect(view.notice).not.toMatch(/\{/u)
    })

    it.each(FAILURES)('says it in Portuguese too, differently ($code)', (failure) => {
      const pt = presentOutcome({ state: 'failed', failure }, 'pt').notice
      const en = presentOutcome({ state: 'failed', failure }, 'en').notice

      expect(pt).toBeTruthy()
      expect(pt).not.toBe(en)
    })

    it('names the file that could not be read', () => {
      const view = presentOutcome(
        { state: 'failed', failure: { code: 'AUDIO_UNREADABLE' } },
        'en',
        { filename: 'ep-12.m4a' },
      )

      expect(view.notice).toContain('ep-12.m4a')
    })

    // Being refused for the allowance is a wait, even when it arrives as a
    // failure — so it says how long, in minutes.
    it('turns a refusal for the allowance into a time to come back', () => {
      const view = presentOutcome(
        { state: 'failed', failure: { code: 'ALLOWANCE_EXHAUSTED', retryAfterMs: 195_500 } },
        'en',
      )

      expect(view.notice).toContain('4 minutes')
    })
  })

  it('reports a failure with the reason the pipeline gave', () => {
    const view = presentOutcome(
      { state: 'failed', failure: { code: 'PROVIDER_UNAVAILABLE' } },
      'en',
    )

    expect(view.statusLabel).toBe('Failed')
    expect(view.notice).not.toBe('')
  })
})

describe('timestamp', () => {
  it.each([
    [0, '00:00'],
    [65_000, '01:05'],
    [599_000, '09:59'],
    [3_600_000, '1:00:00'],
    [7_591_000, '2:06:31'],
  ])('writes %i as %s', (ms, expected) => {
    expect(timestamp(ms)).toBe(expected)
  })

  // Hours only appear once there are hours. `00:01:05` on a two-minute clip
  // is noise.
  it('leaves the hour off when there is none', () => {
    expect(timestamp(119_000)).toBe('01:59')
  })

  it('rounds down to the second the audio is actually at', () => {
    expect(timestamp(65_999)).toBe('01:05')
  })
})
