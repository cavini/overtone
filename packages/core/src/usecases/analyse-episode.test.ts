// US-003, US-004, US-005
import { describe, expect, it } from 'vitest'
import type { Topic } from '../domain/topic.js'
import type { LemmaLookup } from '../domain/token.js'
import type { LemmaRepository } from '../ports/lemma-repository.js'
import { FakeTranscriptionProvider } from '../testing/fake-transcription-provider.js'
import { analyseEpisode } from './analyse-episode.js'

const AUDIO = 'audio://episode-12'
const SENTENCE = 'O pirão do churrasco é melhor que o pirão da feira'

const lemmaRepository = (entries: Iterable<readonly [string, string]> = []): LemmaRepository => {
  const dictionary = new Map(entries)
  return {
    lookup: (forms) =>
      Promise.resolve(
        new Map(
          forms.flatMap((form): Array<[string, string]> => {
            const lemma = dictionary.get(form)
            return lemma === undefined ? [] : [[form, lemma]]
          }),
        ) satisfies LemmaLookup,
      ),
  }
}

const analyse = (
  text = SENTENCE,
  lemmas: Iterable<readonly [string, string]> = [],
  topics: readonly Topic[] = [],
) =>
  analyseEpisode(
    { audioUrl: AUDIO, topics },
    {
      transcription: FakeTranscriptionProvider.withText(AUDIO, text),
      lemmas: lemmaRepository(lemmas),
    },
  )

const HOTDOG: Topic = { id: 'topic-1', name: 'Hotdog', patterns: ['hotdog'] }
const PIRAO: Topic = { id: 'topic-2', name: 'Pirão', patterns: ['pirão'] }

describe('analyseEpisode', () => {
  it('turns audio into counted terms', async () => {
    const outcome = await analyse()
    if (!outcome.ok) throw new Error('expected an analysis')

    expect(outcome.analysis.topTerms.map((t) => [t.term, t.count])).toEqual([
      ['pirão', 2],
      ['churrasco', 1],
      ['feira', 1],
      ['melhor', 1],
    ])
  })

  it('reports the shape of the episode', async () => {
    const outcome = await analyse()
    if (!outcome.ok) throw new Error('expected an analysis')

    expect(outcome.analysis).toMatchObject({
      durationMs: 4_400,
      totalTokens: 11,
      wordTokens: 5,
      stopWordTokens: 6,
      fillerTokens: 0,
      uniqueTerms: 4,
      wordsPerMinute: 150,
    })
  })

  it('counts fillers separately from words', async () => {
    const outcome = await analyse(`${SENTENCE} eh ah`)
    if (!outcome.ok) throw new Error('expected an analysis')

    expect(outcome.analysis.fillerTokens).toBe(2)
    expect(outcome.analysis.topTerms.map((t) => t.term)).not.toContain('eh')
  })

  it('asks the dictionary only about the forms this episode actually used', async () => {
    const asked: string[][] = []
    const outcome = await analyseEpisode(
      { audioUrl: AUDIO },
      {
        transcription: FakeTranscriptionProvider.withText(AUDIO, 'falei e falando'),
        lemmas: {
          lookup: (forms) => {
            asked.push([...forms])
            return Promise.resolve(new Map([['falei', 'falar'], ['falando', 'falar']]))
          },
        },
      },
    )

    if (!outcome.ok) throw new Error('expected an analysis')
    expect(asked).toHaveLength(1)
    expect([...(asked[0] ?? [])].sort()).toEqual(['e', 'falando', 'falei'])
    expect(outcome.analysis.topTerms[0]).toMatchObject({ term: 'falar', count: 2 })
  })

  it('caps the number of terms it returns when asked', async () => {
    const outcome = await analyseEpisode(
      { audioUrl: AUDIO, topTermLimit: 2 },
      {
        transcription: FakeTranscriptionProvider.withText(AUDIO, SENTENCE),
        lemmas: lemmaRepository(),
      },
    )

    if (!outcome.ok) throw new Error('expected an analysis')
    expect(outcome.analysis.topTerms).toHaveLength(2)
    // Capping the list must not change the totals it was drawn from.
    expect(outcome.analysis.uniqueTerms).toBe(4)
  })

  it('records the versions that produced the numbers', async () => {
    const outcome = await analyse()
    if (!outcome.ok) throw new Error('expected an analysis')

    expect(outcome.analysis.pipelineVersion).toBeGreaterThan(0)
    expect(outcome.analysis.vocabularyVersion).toBeGreaterThan(0)
  })

  it('passes a transcription failure straight through', async () => {
    const outcome = await analyseEpisode(
      { audioUrl: 'audio://missing' },
      {
        transcription: FakeTranscriptionProvider.withText(AUDIO, SENTENCE),
        lemmas: lemmaRepository(),
      },
    )

    expect(outcome.ok).toBe(false)
    if (outcome.ok) throw new Error('expected a failure')
    expect(outcome.failure.code).toBe('AUDIO_NOT_FOUND')
  })

  it('never asks for a transcript it already failed to get', async () => {
    let asked = 0
    await analyseEpisode(
      { audioUrl: 'audio://missing' },
      {
        transcription: FakeTranscriptionProvider.withText(AUDIO, SENTENCE),
        lemmas: {
          lookup: (forms) => {
            asked += 1
            return Promise.resolve(new Map())
          },
        },
      },
    )
    expect(asked).toBe(0)
  })

  it('handles silence without dividing by zero', async () => {
    const outcome = await analyse('')
    if (!outcome.ok) throw new Error('expected an analysis')

    expect(outcome.analysis).toMatchObject({
      durationMs: 0,
      totalTokens: 0,
      wordsPerMinute: 0,
      uniqueTerms: 0,
    })
    expect(outcome.analysis.topTerms).toEqual([])
  })

  describe('running jokes', () => {
    it('counts a topic across its spellings', async () => {
      const outcome = await analyse('eu amo hotdog e hot dog', [], [HOTDOG])
      if (!outcome.ok) throw new Error('expected an analysis')

      expect(outcome.analysis.topics).toEqual([
        {
          topicId: 'topic-1',
          topicName: 'Hotdog',
          count: 2,
          mentions: [
            { matchedText: 'hotdog', startMs: 800, endMs: 1_200 },
            { matchedText: 'hot dog', startMs: 1_600, endMs: 2_400 },
          ],
        },
      ])
    })

    // Every mention can be played back. This is what makes a count arguable
    // rather than something to be taken on faith.
    it('locates every mention in the audio', async () => {
      const outcome = await analyse('hotdog', [], [HOTDOG])
      if (!outcome.ok) throw new Error('expected an analysis')

      const [mention] = outcome.analysis.topics[0]?.mentions ?? []
      expect(mention).toEqual({ matchedText: 'hotdog', startMs: 0, endMs: 400 })
    })

    it('reports a topic that never came up as zero', async () => {
      const outcome = await analyse('só falamos de churrasco', [], [HOTDOG])
      if (!outcome.ok) throw new Error('expected an analysis')

      expect(outcome.analysis.topics).toEqual([
        { topicId: 'topic-1', topicName: 'Hotdog', count: 0, mentions: [] },
      ])
    })

    it('ranks the topics that came up most first', async () => {
      const outcome = await analyse(
        'pirão hotdog pirão pirão',
        [],
        [HOTDOG, PIRAO],
      )
      if (!outcome.ok) throw new Error('expected an analysis')

      expect(outcome.analysis.topics.map((t) => [t.topicName, t.count])).toEqual([
        ['Pirão', 3],
        ['Hotdog', 1],
      ])
    })

    it('breaks a tie between topics alphabetically, so the order is stable', async () => {
      const outcome = await analyse('hotdog pirão', [], [PIRAO, HOTDOG])
      if (!outcome.ok) throw new Error('expected an analysis')

      expect(outcome.analysis.topics.map((t) => t.topicName)).toEqual([
        'Hotdog',
        'Pirão',
      ])
    })

    it('reports no topics when none are being tracked', async () => {
      const outcome = await analyse(SENTENCE)
      if (!outcome.ok) throw new Error('expected an analysis')
      expect(outcome.analysis.topics).toEqual([])
    })
  })

  it('is deterministic', async () => {
    const once = await analyse(SENTENCE, [['falei', 'falar']])
    const twice = await analyse(SENTENCE, [['falei', 'falar']])
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once))
  })
})
