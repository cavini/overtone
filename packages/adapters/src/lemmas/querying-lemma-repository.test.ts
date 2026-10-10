// US-016 · ADR 0014, 0019
import type { AudioLanguage } from '@overtone/core'
import { describe, expect, it, vi } from 'vitest'
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
    ], 'pt')

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
    ], 'pt')

    expect(batches).toHaveLength(1)
    expect([...(batches[0] ?? [])].sort()).toEqual(['falando', 'falei'])
  })

  // An episode with nothing in it should not cost a round trip.
  it('does not query at all for an empty list', async () => {
    const { query, batches } = recordingQuery()
    const lemmas = await new QueryingLemmaRepository(query).lookup([], 'pt')

    expect(lemmas.size).toBe(0)
    expect(batches).toEqual([])
  })

  it('splits a very large vocabulary into batches', async () => {
    const { query, batches } = recordingQuery()
    const forms = Array.from({ length: LOOKUP_BATCH_SIZE * 2 + 1 }, (_, i) => `w${i}`)

    await new QueryingLemmaRepository(query).lookup(forms, 'pt')

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
    ], 'pt')

    expect(lemmas.get('falei')).toBe('falar')
    expect(lemmas.get('casas')).toBe('casa')
  })

  it('keeps only rows it asked about', async () => {
    const chatty: LemmaQuery = () =>
      Promise.resolve([
        { form: 'falei', lemma: 'falar' },
        { form: 'nunca-pedi-isso', lemma: 'surpresa' },
      ])

    const lemmas = await new QueryingLemmaRepository(chatty).lookup(['falei'], 'pt')
    expect([...lemmas.keys()]).toEqual(['falei'])
  })

  it('returns an empty map when the dictionary knows nothing', async () => {
    const empty: LemmaQuery = () => Promise.resolve([])
    expect((await new QueryingLemmaRepository(empty).lookup(['pirão'], 'pt')).size).toBe(0)
  })
})

describe('QueryingLemmaRepository, across two languages', () => {
  it('passes the language down to every batch', async () => {
    const asked: string[] = []
    const repository = new QueryingLemmaRepository(async (forms, language) => {
      asked.push(language)
      return forms.map((form) => ({ form, lemma: form }))
    })

    await repository.lookup(['move', 'serve'], 'en')

    expect(asked).toEqual(['en'])
  })
})

describe('QueryingLemmaRepository, deciding what is a verb', () => {
  const asking = (known: readonly string[]) =>
    vi.fn((forms: readonly string[], _language: AudioLanguage) =>
      Promise.resolve(forms.filter((form) => known.includes(form))),
    )

  it('answers with the forms the source knows', async () => {
    const verbs = asking(['fala', 'falou'])
    const repository = new QueryingLemmaRepository(async () => [], verbs)

    expect(await repository.verbForms(['fala', 'gato', 'falou'], 'pt')).toEqual(
      new Set(['fala', 'falou']),
    )
  })

  /*
   * No source is not the same as a source that knows nothing. An app with
   * no verb table loaded still works — it simply trusts the dictionary,
   * which was right more often than it was wrong (ADR 0029).
   */
  it('answers with nothing at all when there is no source', async () => {
    const repository = new QueryingLemmaRepository(async () => [])

    expect(await repository.verbForms(['fala'], 'pt')).toEqual(new Set())
  })

  it('does not ask when there is nothing to ask about', async () => {
    const verbs = asking([])
    await new QueryingLemmaRepository(async () => [], verbs).verbForms([], 'pt')

    expect(verbs).not.toHaveBeenCalled()
  })

  // An episode has a few thousand distinct forms, and an enormous array
  // parameter makes a query plan worse rather than better.
  it('asks in batches', async () => {
    const many = Array.from({ length: LOOKUP_BATCH_SIZE + 10 }, (_, at) => `w${at}`)
    const verbs = asking([])
    await new QueryingLemmaRepository(async () => [], verbs).verbForms(many, 'pt')

    expect(verbs).toHaveBeenCalledTimes(2)
  })

  it('ignores a form it never asked about', async () => {
    const stray = vi.fn(() => Promise.resolve(['something-else']))
    const repository = new QueryingLemmaRepository(async () => [], stray)

    expect(await repository.verbForms(['fala'], 'pt')).toEqual(new Set())
  })

  it('asks about one language at a time', async () => {
    const verbs = asking(['fala'])
    await new QueryingLemmaRepository(async () => [], verbs).verbForms(['fala'], 'en')

    expect(verbs.mock.calls[0]?.[1]).toBe('en')
  })
})
