// US-016 · ADR 0019
import { drizzle } from 'drizzle-orm/pg-proxy'
import { describe, expect, it } from 'vitest'
import { lemmaQuery } from './lemma-query.js'

const capturing = (rows: unknown[][] = []) => {
  const seen: Array<{ sql: string; params: unknown[] }> = []
  const db = drizzle(async (sql, params) => {
    seen.push({ sql, params })
    return { rows }
  })
  return { db, seen }
}

describe('lemmaQuery', () => {
  it('reads form and lemma for the forms it was given', async () => {
    const { db, seen } = capturing([['falei', 'falar']])
    const rows = await lemmaQuery(db)(['falei', 'falando'], 'pt')

    expect(rows).toEqual([{ form: 'falei', lemma: 'falar' }])
    expect(seen[0]?.sql).toContain('"lemmas"')
    expect(seen[0]?.sql).toContain('"form"')
    expect(seen[0]?.sql).toContain('"lemma"')
  })

  // `= any($1)` takes the whole list as one parameter. An `in (…)` list would
  // put one placeholder per word, and an episode has thousands.
  it('passes the whole list as a single array parameter', async () => {
    const { db, seen } = capturing()
    await lemmaQuery(db)(['falei', 'falando', 'pirão'], 'pt')

    expect(seen[0]?.sql).toMatch(/= any/i)
    // Two parameters: the language, and the whole list of forms as one array.
    expect(seen[0]?.params).toHaveLength(2)
    expect(seen[0]?.params[1]).toEqual(['falei', 'falando', 'pirão'])
  })

  it('reads nothing else from the dictionary table', async () => {
    const { db, seen } = capturing()
    await lemmaQuery(db)(['falei'], 'pt')
    expect(seen[0]?.sql).not.toMatch(/join/i)
    expect(seen[0]?.sql).not.toMatch(/order by/i)
  })

  it('makes one query', async () => {
    const { db, seen } = capturing()
    await lemmaQuery(db)(['a', 'b', 'c'], 'pt')
    expect(seen).toHaveLength(1)
  })

  it('returns nothing when the dictionary knows nothing', async () => {
    const { db } = capturing([])
    expect(await lemmaQuery(db)(['pirão'], 'pt')).toEqual([])
  })
})

describe('lemmaQuery, across two languages', () => {
  /*
   * `move` is in both halves of the dictionary: in Portuguese it is the third
   * person of `mover`, in English a verb of its own. A query that did not say
   * which language it wanted would get whichever row the index reached first,
   * and the analysis would be handed the other language's answer with nothing
   * to show that it had happened.
   */
  it('asks for one language, not for a spelling', async () => {
    const { db, seen } = capturing([])
    await lemmaQuery(db)(['move'], 'en')

    expect(seen[0]?.sql).toContain('"language"')
    expect(seen[0]?.params).toContain('en')
  })
})
