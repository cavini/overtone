// The whole pipeline on real Brazilian Portuguese, with the real dictionary.
//
// Everything below the browser: a transcript in, counted terms and located
// running jokes out. The transcription service is faked — the free allowance
// is shared across every user of the app, so a test suite that spent it would
// take the product down — but the Portuguese, the lemmas and the counting are
// all real.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyseEpisode, type Topic } from '@overtone/core'
import { FakeTranscriptionProvider } from '@overtone/core/testing'
import { beforeAll, describe, expect, it } from 'vitest'
import { parseLemmaList } from '../lemmas/parse-lemma-list.js'
import { QueryingLemmaRepository } from '../lemmas/querying-lemma-repository.js'

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../fixtures')

const AUDIO = 'audio://episode-12'

const HOTDOG: Topic = {
  id: 'topic-hotdog',
  name: 'Hotdog',
  patterns: ['hotdog'],
}
const PIRAO: Topic = { id: 'topic-pirao', name: 'Pirão', patterns: ['pirão'] }
const GRAVACAO: Topic = {
  id: 'topic-gravacao',
  name: 'Gravação',
  patterns: ['gravação'],
}

let analysis: Awaited<ReturnType<typeof analyseEpisode>>

beforeAll(async () => {
  const dictionary = new Map(
    parseLemmaList(readFileSync(`${fixtures}/lemmas-sample.tsv`, 'utf8')),
  )
  const transcript = readFileSync(`${fixtures}/episode-transcript.txt`, 'utf8')

  analysis = await analyseEpisode(
    // The whole vocabulary rather than the top 25, so assertions below can
    // reach a term that was only said once.
    { audioUrl: AUDIO, topics: [HOTDOG, PIRAO, GRAVACAO], topTermLimit: 500 },
    {
      transcription: FakeTranscriptionProvider.withText(AUDIO, transcript),
      lemmas: new QueryingLemmaRepository((forms) =>
        Promise.resolve(
          forms.flatMap((form) => {
            const lemma = dictionary.get(form)
            return lemma === undefined ? [] : [{ form, lemma }]
          }),
        ),
      ),
    },
  )
})

const result = () => {
  if (!analysis.ok) throw new Error('expected an analysis')
  return analysis.analysis
}

const term = (name: string) => result().topTerms.find((t) => t.term === name)
const topic = (name: string) => result().topics.find((t) => t.topicName === name)

describe('the pipeline, end to end', () => {
  it('produces an analysis', () => {
    expect(analysis.ok).toBe(true)
  })

  // The payoff of the dictionary. Eight spellings of one verb, one term.
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
    for (const stopWord of ['o', 'a', 'de', 'que', 'ele', 'é', 'no']) {
      expect(result().topTerms.map((t) => t.term)).not.toContain(stopWord)
    }
  })

  // These counts are the joke, so they stay countable rather than being
  // filtered away as noise.
  it('counts the discourse markers a podcast finds funny', () => {
    expect(term('tipo')?.count).toBe(2)
    expect(term('né')?.count).toBe(1)
  })

  it('never merges two words that differ by an accent', () => {
    const terms = result().topTerms.map((t) => t.term)
    expect(terms).toContain('mês')
    expect(terms).not.toContain('mes')
  })

  describe('running jokes', () => {
    // The stakeholder's own example, on real text: three spellings, one joke.
    it('counts hotdog across every spelling it was written in', () => {
      expect(topic('Hotdog')?.count).toBe(4)
      expect(topic('Hotdog')?.mentions.map((m) => m.matchedText)).toEqual([
        'hotdog', 'hotdog', 'hot dog', 'hot-dog',
      ])
    })

    it('counts a one-word joke', () => {
      expect(topic('Pirão')?.count).toBe(2)
    })

    it('finds a joke through its inflection', () => {
      expect(topic('Gravação')?.count).toBe(2)
      expect(topic('Gravação')?.mentions.map((m) => m.matchedText)).toEqual([
        'gravações', 'gravações',
      ])
    })

    // Every mention is playable. This is what makes a count arguable instead
    // of something to be taken on faith.
    it('locates every mention in the audio, in order', () => {
      const mentions = topic('Hotdog')?.mentions ?? []
      expect(mentions).not.toHaveLength(0)

      for (const mention of mentions) {
        expect(mention.endMs).toBeGreaterThan(mention.startMs)
        expect(mention.endMs).toBeLessThanOrEqual(result().durationMs)
      }

      const starts = mentions.map((m) => m.startMs)
      expect([...starts].sort((a, b) => a - b)).toEqual(starts)
    })

    it('ranks the jokes by how often they came up', () => {
      expect(result().topics.map((t) => t.topicName)).toEqual([
        'Hotdog', 'Gravação', 'Pirão',
      ])
    })
  })

  it('conserves every token across the three classes', () => {
    const { wordTokens, stopWordTokens, fillerTokens, totalTokens } = result()
    expect(wordTokens + stopWordTokens + fillerTokens).toBe(totalTokens)
  })

  it('records the versions that produced these numbers', () => {
    expect(result().pipelineVersion).toBeGreaterThan(0)
    expect(result().vocabularyVersion).toBeGreaterThan(0)
  })
})
