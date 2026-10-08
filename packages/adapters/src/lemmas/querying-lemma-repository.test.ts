// US-016 · ADR 0014, 0019
import { describe, expect, it } from 'vitest'
import {
  LOOKUP_BATCH_SIZE,
  QueryingLemmaRepository,
  type LemmaQuery,
} from './querying-lemma-repository.js'

const DICTIONARY = new Map([
  ['falei', 'falar'],
  ['falando', 'falar'],
  ['casas', 'casa'],
  ['país', 'país'],
])

/** Stands in for the database, and records what it was asked. */
const recordingQuery = () => {
  const batches: string[][] = []
  const query: LemmaQuery = (forms) => {
    batches.push([...forms])
    return Promise.resolve(
      forms.flatMap((form) => {
        const lemma = DICTIONARY.get(form)
        return lemma === undefined ? [] : [{ form, lemma }]
      }),
    )
  }
  return { query, batches }
}

describe('QueryingLemmaRepository', () => {
  it('returns the lemmas it found', async () => {
    const { query } = recordingQuery()
    const lemmas = await new QueryingLemmaRepository(query).lookup([
      'falei',
      'falando',
      'pirão',
    ])

    expect(lemmas.get('falei')).toBe('falar')
    expect(lemmas.get('falando')).toBe('falar')
    // An absent form is simply missing, so the caller falls back to the
    // stemmer rather than being handed a wrong answer.
    expect(lemmas.has('pirão')).toBe(false)
  })

  it('asks about each form once, however often it was said', async () => {
    const { query, batches } = recordingQuery()
    await new QueryingLemmaRepository(query).lookup([
      'falei', 'falei', 'falando', 'falei',
    ])

    expect(batches).toHaveLength(1)
    expect([...(batches[0] ?? [])].sort()).toEqual(['falando', 'falei'])
  })

  // An episode with nothing in it should not cost a round trip.
  it('does not query at all for an empty list', async () => {
    const { query, batches } = recordingQuery()
    const lemmas = await new QueryingLemmaRepository(query).lookup([])

    expect(lemmas.size).toBe(0)
    expect(batches).toEqual([])
  })

  it('splits a very large vocabulary into batches', async () => {
    const { query, batches } = recordingQuery()
    const forms = Array.from({ length: LOOKUP_BATCH_SIZE * 2 + 1 }, (_, i) => `w${i}`)

    await new QueryingLemmaRepository(query).lookup(forms)

    expect(batches).toHaveLength(3)
    expect(batches[0]).toHaveLength(LOOKUP_BATCH_SIZE)
    expect(batches[2]).toHaveLength(1)
  })

  it('merges what every batch found', async () => {
    const { query } = recordingQuery()
    const filler = Array.from({ length: LOOKUP_BATCH_SIZE }, (_, i) => `w${i}`)
    const lemmas = await new QueryingLemmaRepository(query).lookup([
      ...filler,
      'falei',
      'casas',
    ])

    expect(lemmas.get('falei')).toBe('falar')
    expect(lemmas.get('casas')).toBe('casa')
  })

  it('keeps only rows it asked about', async () => {
    const chatty: LemmaQuery = () =>
      Promise.resolve([
        { form: 'falei', lemma: 'falar' },
        { form: 'nunca-pedi-isso', lemma: 'surpresa' },
      ])

    const lemmas = await new QueryingLemmaRepository(chatty).lookup(['falei'])
    expect([...lemmas.keys()]).toEqual(['falei'])
  })

  it('returns an empty map when the dictionary knows nothing', async () => {
    const empty: LemmaQuery = () => Promise.resolve([])
    expect((await new QueryingLemmaRepository(empty).lookup(['pirão'])).size).toBe(0)
  })
})
